import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { isOffensiveName } from "../players/names.js";
import type { Db } from "../db/client.js";
import { passwordResets, users } from "../db/schema.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import {
  SESSION_COOKIE,
  type SessionUser,
  createSession,
  deleteSession,
  deleteUserSessions,
  userColumns,
  userForToken,
} from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/** How many crew portraits there are to pick from. */
export const AVATAR_COUNT = 8;

/** Emails are kept in lower case; uniqueness ignores case too (see the users_email_lower index). */
const Email = z.string().trim().toLowerCase().email("That email doesn't look right").max(254);

const SignupBody = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "Usernames are 3–20 letters, numbers or underscores")
    .refine((name) => !isOffensiveName(name), "Please pick a different username"),
  email: Email,
  password: z.string().min(8, "Passwords need at least 8 characters").max(200),
});

const LoginBody = z.object({
  login: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  void reply.code(400).send({ error: result.error.issues[0]?.message ?? "Invalid request" });
  return null;
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (req.user) return req.user;
  void reply.code(401).send({ error: "Sign in first" });
  return null;
}

/** The iPhone app sends this header; it signs in with a token instead of a cookie. */
export const APP_CLIENT_HEADER = "x-deckhand-client";
/** The app's WebSocket can't set headers, so it offers the token as a second subprotocol. */
export const WS_TOKEN_PREFIX = "bearer.";

const isAppClient = (req: FastifyRequest) => req.headers[APP_CLIENT_HEADER] === "app";

/** The session token from the cookie (web), an Authorization header or the socket subprotocol (app). */
export function sessionToken(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const protocols = req.headers["sec-websocket-protocol"];
  if (typeof protocols === "string") {
    const offered = protocols.split(",").map((p) => p.trim());
    const bearer = offered.find((p) => p.startsWith(WS_TOKEN_PREFIX));
    if (bearer) return bearer.slice(WS_TOKEN_PREFIX.length);
  }
  return req.cookies[SESSION_COOKIE];
}

/**
 * Attach the signed-in user to every request. Called on the root app (not inside a plugin)
 * so the hook covers all routes.
 */
export function attachSessions(app: FastifyInstance, db: Db) {
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const token = sessionToken(req);
    req.user = token ? await userForToken(db, token) : null;
  });
}

export async function authRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Sign in: a cookie for the web, or the token in the response for the app (which has no cookies). */
  async function startSession(
    req: FastifyRequest,
    reply: FastifyReply,
    userId: string,
  ): Promise<{ token?: string }> {
    const { token, expiresAt } = await createSession(db, userId);
    if (isAppClient(req)) return { token };
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      // Secure whenever the request came in over HTTPS (e.g. through a Cloudflare tunnel).
      secure: "auto",
      expires: expiresAt,
    });
    return {};
  }

  const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/api/auth/signup", authLimit, async (req, reply) => {
    const body = parseBody(SignupBody, req.body, reply);
    if (!body) return;
    const taken = await db
      .select({ username: users.username, email: users.email })
      .from(users)
      .where(
        or(sql`lower(${users.username}) = lower(${body.username})`, eq(users.email, body.email)),
      )
      .limit(1);
    if (taken[0]) {
      const which = taken[0].email === body.email ? "email" : "username";
      return reply.code(409).send({ error: `That ${which} is already taken` });
    }
    // The very first account is the admin (on Umbrel, that's normally the owner).
    const [anyone] = await db.select({ id: users.id }).from(users).limit(1);
    const [user] = await db
      .insert(users)
      .values({
        username: body.username,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        isAdmin: !anyone,
      })
      .returning(userColumns);
    const session = await startSession(req, reply, user!.id);
    return reply.code(201).send({ user, ...session });
  });

  app.post("/api/auth/login", authLimit, async (req, reply) => {
    const body = parseBody(LoginBody, req.body, reply);
    if (!body) return;
    const [row] = await db
      .select()
      .from(users)
      .where(
        or(
          sql`lower(${users.username}) = lower(${body.login})`,
          sql`lower(${users.email}) = lower(${body.login})`,
        ),
      )
      .limit(1);
    // Same message either way, so the form doesn't reveal which accounts exist.
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      return reply.code(401).send({ error: "Wrong username or password" });
    }
    if (row.disabledAt) return reply.code(403).send({ error: "This account has been disabled" });
    // Upgrade older, weaker password hashes now that we have the password in hand.
    if (needsRehash(row.passwordHash)) {
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(body.password) })
        .where(eq(users.id, row.id));
    }
    const session = await startSession(req, reply, row.id);
    return {
      ...session,
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        rating: row.rating,
        rankedGames: row.rankedGames,
        avatar: row.avatar,
        isAdmin: row.isAdmin,
      },
    };
  });

  app.post("/api/auth/password", authLimit, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(
      z.object({
        current: z.string().min(1).max(200),
        next: z.string().min(8, "Passwords need at least 8 characters").max(200),
      }),
      req.body,
      reply,
    );
    if (!body) return;
    const [row] = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id));
    if (!row || !(await verifyPassword(body.current, row.hash))) {
      return reply.code(401).send({ error: "Your current password isn't right" });
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.next) })
      .where(eq(users.id, user.id));
    // Sign out everywhere else; this browser stays signed in.
    await deleteUserSessions(db, user.id, sessionToken(req));
    return { ok: true };
  });

  /**
   * Change your account email (D-19). Your password is checked first; your other sessions are
   * signed out (this one stays), and any reset link sent to the old address stops working.
   */
  app.post("/api/auth/email", authLimit, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(
      z.object({ password: z.string().min(1).max(200), email: Email }),
      req.body,
      reply,
    );
    if (!body) return;
    const [row] = await db
      .select({ hash: users.passwordHash, email: users.email })
      .from(users)
      .where(eq(users.id, user.id));
    if (!row || !(await verifyPassword(body.password, row.hash))) {
      return reply.code(401).send({ error: "That password isn't right" });
    }
    if (row.email.toLowerCase() === body.email) {
      return reply.code(400).send({ error: "That's already your email" });
    }
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${body.email}`, ne(users.id, user.id)))
      .limit(1);
    if (taken.length) return reply.code(409).send({ error: "That email is already taken" });
    try {
      await db.update(users).set({ email: body.email }).where(eq(users.id, user.id));
    } catch (err) {
      // Someone took it in the moment between the check and the change.
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e.code ?? e.cause?.code) === "23505")
        return reply.code(409).send({ error: "That email is already taken" });
      throw err;
    }
    await db
      .delete(passwordResets)
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));
    await deleteUserSessions(db, user.id, sessionToken(req));
    return { user: { ...user, email: body.email } };
  });

  /**
   * Delete your own account for good. Your sessions, friends, stats, achievements, daily discards and unfinished games go with it;
   * finished matches stay in your opponents' history without your name.
   */
  app.post("/api/auth/delete", authLimit, async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(z.object({ password: z.string().min(1).max(200) }), req.body, reply);
    if (!body) return;
    const [row] = await db
      .select({ hash: users.passwordHash, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, user.id));
    if (!row || !(await verifyPassword(body.password, row.hash))) {
      return reply.code(401).send({ error: "That password isn't right" });
    }
    if (row.isAdmin) {
      const [count] = await db
        .select({ admins: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.isAdmin, true));
      if ((count?.admins ?? 0) <= 1) {
        return reply
          .code(409)
          .send({ error: "You're the only admin. Make another player an admin first." });
      }
    }
    await db.delete(users).where(eq(users.id, user.id));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = sessionToken(req);
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ user: req.user }));

  /** Pick a crew portrait (1-8), or null to go back to your initial. */
  app.post("/api/auth/avatar", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(
      z.object({ avatar: z.number().int().min(1).max(AVATAR_COUNT).nullable() }),
      req.body,
      reply,
    );
    if (!body) return;
    await db.update(users).set({ avatar: body.avatar }).where(eq(users.id, user.id));
    return { user: { ...user, avatar: body.avatar } };
  });
}
