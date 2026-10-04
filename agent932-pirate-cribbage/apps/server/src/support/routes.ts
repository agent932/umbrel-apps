import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../admin/routes.js";
import { parseBody } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { supportMessages, users } from "../db/schema.js";
import { type Mailer, emailSettings, simpleEmail } from "../email/mailer.js";

export const SUPPORT_TOPICS = {
  help: "Help playing",
  account: "My account",
  bug: "Something's broken",
  feedback: "Ideas and feedback",
  other: "Something else",
} as const;

const SupportBody = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.string().trim().email("That email doesn't look right").max(200),
  topic: z.enum(Object.keys(SUPPORT_TOPICS) as [keyof typeof SUPPORT_TOPICS]),
  message: z.string().trim().min(10, "Tell us a little more (10 characters or so)").max(4000),
  /** A hidden field people never see; bots fill it in. */
  website: z.string().max(200).optional(),
});

/** The support page's contact form, and the admin inbox for it. */
export async function supportRoutes(
  app: FastifyInstance,
  { db, mailer }: { db: Db; mailer: Mailer },
) {
  app.post(
    "/api/support",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const body = parseBody(SupportBody, req.body, reply);
      if (!body) return;
      // Looks sent either way, so bots learn nothing.
      if (body.website) return { ok: true };
      await db.insert(supportMessages).values({
        name: body.name,
        email: body.email,
        topic: body.topic,
        message: body.message,
        userId: req.user?.id ?? null,
      });

      const config = await emailSettings(db);
      if (config) {
        const admins = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.isAdmin, true));
        const who = req.user ? `${body.name} (signed in as ${req.user.username})` : body.name;
        for (const admin of admins) {
          const email = simpleEmail({
            to: admin.email,
            subject: `Support: ${SUPPORT_TOPICS[body.topic]} from ${body.name}`,
            lines: [
              `${who} <${body.email}> wrote:`,
              body.message,
              "Reply to this email to answer them.",
            ],
            button: { label: "Open the Admin page", url: `${config.siteUrl}/admin` },
          });
          await mailer(config, { ...email, replyTo: body.email }).catch((e: unknown) =>
            req.log.error(e),
          );
        }
      }
      return { ok: true };
    },
  );

  app.get("/api/admin/support", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = await db
      .select({
        id: supportMessages.id,
        name: supportMessages.name,
        email: supportMessages.email,
        topic: supportMessages.topic,
        message: supportMessages.message,
        username: users.username,
        createdAt: supportMessages.createdAt,
      })
      .from(supportMessages)
      .leftJoin(users, eq(users.id, supportMessages.userId))
      .orderBy(desc(supportMessages.createdAt))
      .limit(200);
    return { messages: rows };
  });

  /** Done with it: deleting is how a message is marked handled (and keeps no data longer than needed). */
  app.delete("/api/admin/support/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!z.string().uuid().safeParse(id).success)
      return reply.code(404).send({ error: "Not found" });
    await db.delete(supportMessages).where(eq(supportMessages.id, id));
    return { ok: true };
  });
}
