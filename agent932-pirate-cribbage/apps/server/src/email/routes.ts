import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../admin/routes.js";
import { parseBody } from "../auth/routes.js";
import { hashPassword } from "../auth/password.js";
import { deleteUserSessions } from "../auth/sessions.js";
import type { Db } from "../db/client.js";
import { passwordResets, users } from "../db/schema.js";
import { type Mailer, emailSettings, saveEmailSettings, simpleEmail } from "./mailer.js";

const RESET_MINUTES = 60;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Admin email settings, password reset by email. */
export async function emailRoutes(
  app: FastifyInstance,
  { db, mailer }: { db: Db; mailer: Mailer },
) {
  app.get("/api/email/enabled", async () => ({ enabled: (await emailSettings(db)) !== null }));

  app.get("/api/admin/email", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const config = await emailSettings(db);
    return {
      configured: config !== null,
      keyHint: config ? config.apiKey.slice(-4) : null,
      from: config?.from ?? "",
      siteUrl: config?.siteUrl ?? `${req.protocol}://${req.host}`,
    };
  });

  app.put("/api/admin/email", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = parseBody(
      z.object({
        /** Leave out to keep the saved key. */
        apiKey: z.string().trim().min(10).max(200).optional(),
        from: z.string().trim().min(3).max(200),
        siteUrl: z.string().trim().url().max(200),
      }),
      req.body,
      reply,
    );
    if (!body) return;
    const apiKey = body.apiKey ?? (await emailSettings(db))?.apiKey;
    if (!apiKey) return reply.code(400).send({ error: "Paste your Resend API key" });
    await saveEmailSettings(db, {
      apiKey,
      from: body.from,
      siteUrl: body.siteUrl.replace(/\/+$/, ""),
    });
    return { ok: true, keyHint: apiKey.slice(-4) };
  });

  app.post("/api/admin/email/test", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const config = await emailSettings(db);
    if (!config) return reply.code(400).send({ error: "Save the email settings first" });
    try {
      await mailer(
        config,
        simpleEmail({
          to: admin.email,
          subject: "Ahoy from Deckhand Games",
          lines: [
            `Ahoy, ${admin.username}! Email is working. Your crew can now reset passwords and send invites.`,
          ],
          button: { label: "Open Deckhand Games", url: config.siteUrl },
        }),
      );
    } catch (e) {
      return reply.code(502).send({ error: e instanceof Error ? e.message : "Couldn't send" });
    }
    return { ok: true, to: admin.email };
  });

  /** Your opt-in email notices. */
  app.get("/api/auth/notices", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Sign in first" });
    const [u] = await db
      .select({ game: users.notifyGame, friends: users.notifyFriends })
      .from(users)
      .where(eq(users.id, req.user.id));
    return u;
  });

  app.put("/api/auth/notices", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Sign in first" });
    const body = parseBody(z.object({ game: z.boolean(), friends: z.boolean() }), req.body, reply);
    if (!body) return;
    await db
      .update(users)
      .set({ notifyGame: body.game, notifyFriends: body.friends })
      .where(eq(users.id, req.user.id));
    return body;
  });

  /** The one-click link at the bottom of every notice: turns them all off, no sign-in needed. */
  app.get<{ Params: { token: string } }>("/api/email/unsubscribe/:token", async (req, reply) => {
    const token = z.string().uuid().safeParse(req.params.token);
    if (token.success) {
      await db
        .update(users)
        .set({ notifyGame: false, notifyFriends: false })
        .where(eq(users.unsubscribeToken, token.data));
    }
    return reply
      .type("text/html; charset=utf-8")
      .send(
        '<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribed</title>' +
          '<body style="font-family:Georgia,serif;background:#04121c;color:#f3e5c0;text-align:center;padding:48px">' +
          '<h1 style="color:#f2b84b">Done, matey</h1><p>You won\'t get any more notice emails from Deckhand Games.</p>' +
          "<p>You can turn them back on any time under Account.</p></body>",
      );
  });

  const limit = { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } };

  /** Always says the same thing, so nobody can use it to find out who has an account. */
  app.post("/api/auth/forgot", limit, async (req, reply) => {
    const body = parseBody(z.object({ login: z.string().trim().min(1).max(254) }), req.body, reply);
    if (!body) return;
    const done = { ok: true };
    const config = await emailSettings(db);
    if (!config) return done;
    const login = body.login.toLowerCase();
    const [user] = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(
        and(
          or(sql`lower(${users.username}) = ${login}`, sql`lower(${users.email}) = ${login}`),
          isNull(users.disabledAt),
        ),
      );
    if (!user) return done;
    const token = randomBytes(32).toString("base64url");
    await db.insert(passwordResets).values({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
    });
    try {
      await mailer(
        config,
        simpleEmail({
          to: user.email,
          subject: "Reset your Deckhand Games password",
          lines: [
            `Ahoy, ${user.username}. Someone (hopefully you) asked to reset your password.`,
            `The link works once, for the next ${RESET_MINUTES} minutes. If it wasn't you, ignore this email and nothing changes.`,
          ],
          button: { label: "Choose a new password", url: `${config.siteUrl}/reset/${token}` },
        }),
      );
    } catch (e) {
      req.log.error(e);
    }
    return done;
  });

  app.post("/api/auth/reset", limit, async (req, reply) => {
    const body = parseBody(
      z.object({
        token: z.string().min(20).max(100),
        password: z.string().min(8, "Passwords need at least 8 characters").max(200),
      }),
      req.body,
      reply,
    );
    if (!body) return;
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, hashToken(body.token)),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      );
    if (!reset) {
      return reply.code(400).send({ error: "That reset link has expired or was already used" });
    }
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.tokenHash, reset.tokenHash));
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password) })
      .where(eq(users.id, reset.userId));
    // Sign out everywhere: whoever had the old password is out.
    await deleteUserSessions(db, reset.userId);
    return { ok: true };
  });
}
