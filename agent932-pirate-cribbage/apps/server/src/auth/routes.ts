import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";
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

const SignupBody = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "Usernames are 3–20 letters, numbers or underscores"),
  email: z.string().trim().toLowerCase().email("That email doesn't look right").max(254),
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

/**
 * Attach the signed-in user to every request. Called on the root app (not inside a plugin)
 * so the hook covers all routes.
 */
export function attachSessions(app: FastifyInstance, db: Db) {
  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? await userForToken(db, token) : null;
  });
}

export async function authRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function startSession(reply: FastifyReply, userId: string) {
    const { token, expiresAt } = await createSession(db, userId);
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      // Secure whenever the request came in over HTTPS (e.g. through a Cloudflare tunnel).
      secure: "auto",
      expires: expiresAt,
    });
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
    await startSession(reply, user!.id);
    return reply.code(201).send({ user });
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
    await startSession(reply, row.id);
    return {
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        rating: row.rating,
        rankedGames: row.rankedGames,
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
    await deleteUserSessions(db, user.id, req.cookies[SESSION_COOKIE]);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ user: req.user }));
}
