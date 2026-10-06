import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseBody, requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { supportMessages, users } from "../db/schema.js";
import type { Mailer } from "../email/mailer.js";
import type { Presence } from "../online/presence.js";
import { emailAdmins } from "../support/routes.js";
import { blockPlayer, listBlocked, playerByName, unblockPlayer } from "./blocks.js";

export const REPORT_REASONS = {
  name: "Offensive username",
  behaviour: "Rude or abusive behaviour",
  cheating: "Cheating or stalling",
  other: "Something else",
} as const;

const ReportBody = z.object({
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS]),
  note: z.string().trim().max(1000).optional(),
});

/** Reporting and blocking other players (App Store guideline 1.2). Players are named by username. */
export async function playerRoutes(
  app: FastifyInstance,
  { db, mailer, presence }: { db: Db; mailer: Mailer; presence: Presence },
) {
  /** The other player named in the URL, or a 404 (and never yourself). */
  async function target(username: string, me: string) {
    const them = await playerByName(db, username);
    if (!them || them.id === me) return null;
    return them;
  }

  app.get("/api/blocks", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    return { blocked: await listBlocked(db, user.id) };
  });

  app.post<{ Params: { username: string } }>(
    "/api/players/:username/block",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return;
      const them = await target(req.params.username, user.id);
      if (!them) return reply.code(404).send({ error: "No pirate by that name" });
      await blockPlayer(db, user.id, them.id);
      // Their friends list may have just lost you; it refreshes without saying why.
      presence.notify(them.id, { t: "friends" });
      return { ok: true };
    },
  );

  app.delete<{ Params: { username: string } }>(
    "/api/players/:username/block",
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return;
      const them = await target(req.params.username, user.id);
      if (!them) return reply.code(404).send({ error: "No pirate by that name" });
      await unblockPlayer(db, user.id, them.id);
      return { ok: true };
    },
  );

  /** A report lands in Admin → Support (topic "report"), and the admins get an email. */
  app.post<{ Params: { username: string } }>(
    "/api/players/:username/report",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return;
      const body = parseBody(ReportBody, req.body, reply);
      if (!body) return;
      const them = await target(req.params.username, user.id);
      if (!them) return reply.code(404).send({ error: "No pirate by that name" });
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
      const message = [
        `Reported player: ${them.username}`,
        `Reason: ${REPORT_REASONS[body.reason]}`,
        body.note ? `Note: ${body.note}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await db.insert(supportMessages).values({
        name: user.username,
        email: me?.email ?? "",
        topic: "report",
        message,
        userId: user.id,
      });
      await emailAdmins(db, mailer, {
        subject: `Player report: ${them.username} (${REPORT_REASONS[body.reason]})`,
        lines: [
          `${user.username} reported ${them.username}.`,
          message,
          "Admin → Players can disable the account if it breaks the rules.",
        ],
      }).catch((e: unknown) => req.log.error(e));
      return reply.code(201).send({ ok: true });
    },
  );
}
