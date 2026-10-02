import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { createDeck } from "@pirate/engine";

export interface AppOptions {
  /** Returns true when the database answers. Injected so tests can run without Postgres. */
  checkDb: () => Promise<boolean>;
  webDist?: string;
  logger?: boolean;
}

export async function buildApp({ checkDb, webDist, logger = true }: AppOptions) {
  const app = Fastify({ logger });

  app.get("/api/health", async (_req, reply) => {
    const dbOk = await checkDb().catch(() => false);
    return reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      deckSize: createDeck().length,
    });
  });

  if (webDist) {
    await app.register(fastifyStatic, { root: webDist });
    // Single-page app: unknown non-API routes fall back to index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
