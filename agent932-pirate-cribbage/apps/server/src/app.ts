import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { attachSessions, authRoutes } from "./auth/routes.js";
import type { Db } from "./db/client.js";
import { gameRoutes } from "./games/routes.js";
import { friendRoutes } from "./friends/routes.js";
import { Presence } from "./online/presence.js";
import { onlineRoutes } from "./online/routes.js";
import type { Timing } from "./online/rooms.js";

export interface AppOptions {
  db: Db;
  /** Returns true when the database answers. */
  checkDb: () => Promise<boolean>;
  webDist?: string;
  logger?: boolean;
  /** Online game clocks; tests shorten them. */
  timing?: Timing;
}

export async function buildApp({ db, checkDb, webDist, logger = true, timing }: AppOptions) {
  // trustProxy: behind Umbrel's app proxy / Cloudflare, so req.protocol reflects HTTPS.
  const app = Fastify({ logger, trustProxy: true });
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

  app.get("/api/health", async (_req, reply) => {
    const dbOk = await checkDb().catch(() => false);
    return reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "up" : "down",
      version: process.env.APP_VERSION ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  attachSessions(app, db);
  await app.register(authRoutes, { db });
  await app.register(gameRoutes, { db });
  // Shared so friend lists can show who's online and challenges reach the right people.
  const presence = new Presence();
  await app.register(onlineRoutes, { db, timing, presence });
  await app.register(friendRoutes, { db, presence });

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
