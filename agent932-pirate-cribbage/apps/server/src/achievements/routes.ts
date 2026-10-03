import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { achievements } from "../db/schema.js";

export async function achievementRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** What you've earned so far, oldest first. */
  app.get("/api/achievements", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Sign in first" });
    const rows = await db
      .select({ key: achievements.key, unlockedAt: achievements.unlockedAt })
      .from(achievements)
      .where(eq(achievements.userId, req.user.id))
      .orderBy(asc(achievements.unlockedAt));
    return { achievements: rows };
  });
}
