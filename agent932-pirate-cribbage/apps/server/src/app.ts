import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { attachSessions, authRoutes } from "./auth/routes.js";
import type { Db } from "./db/client.js";
import { gameRoutes } from "./games/routes.js";
import { adminRoutes } from "./admin/routes.js";
import { friendRoutes } from "./friends/routes.js";
import { Presence } from "./online/presence.js";
import { onlineRoutes } from "./online/routes.js";
import { RoomManager, type Timing } from "./online/rooms.js";

export interface AppOptions {
  db: Db;
  /** Returns true when the database answers. */
  checkDb: () => Promise<boolean>;
  webDist?: string;
  logger?: boolean;
  /** Online game clocks; tests shorten them. */
  timing?: Timing;
  /** Socket messages allowed per connection per 10 seconds; tests that play at bot speed raise it. */
  socketMessageLimit?: number;
}

export async function buildApp({
  db,
  checkDb,
  webDist,
  logger = true,
  timing,
  socketMessageLimit,
}: AppOptions) {
  // trustProxy: behind Umbrel's app proxy / Cloudflare, so req.protocol reflects HTTPS.
  const app = Fastify({ logger, trustProxy: true });
  await app.register(fastifyCookie);
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React and the animation library set inline style attributes; fonts come from Google.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // Vite inlines small images (the card back) as data: URIs.
        imgSrc: ["'self'", "data:"],
        // The game socket is same-origin. The service worker also fetches Google Fonts to cache
        // them for offline play, and runs under this same policy.
        connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Served over plain HTTP on the home network too, so don't force upgrades.
        upgradeInsecureRequests: null,
      },
    },
    // Google Fonts are loaded cross-origin without CORP headers.
    crossOriginEmbedderPolicy: false,
  });
  // Unexpected errors are logged in full but never shown to the browser.
  app.setErrorHandler((err: { statusCode?: number; message: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.code(status).send({ error: "Something went wrong" });
    }
    return reply.code(status).send({ error: err.message });
  });
  await app.register(fastifyRateLimit, {
    global: false,
    // Behind a Cloudflare tunnel, CF-Connecting-IP is the real visitor (Cloudflare sets it and
    // overwrites any copy a visitor sends). X-Forwarded-For can be faked to dodge the limit.
    keyGenerator: (req) => {
      const cf = req.headers["cf-connecting-ip"];
      return (Array.isArray(cf) ? cf[0] : cf) ?? req.ip;
    },
  });
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
  // Online games live here; the admin page lists and can end them.
  const rooms = new RoomManager(db, timing);
  app.addHook("onClose", async () => rooms.close());
  await app.register(onlineRoutes, { db, rooms, presence, messageLimit: socketMessageLimit });
  await app.register(friendRoutes, { db, presence });
  await app.register(adminRoutes, { db, rooms, presence });

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
