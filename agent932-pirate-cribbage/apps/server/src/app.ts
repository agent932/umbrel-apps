import { sep } from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { APP_CLIENT_HEADER, attachSessions, authRoutes } from "./auth/routes.js";
import type { Db } from "./db/client.js";
import { gameRoutes } from "./games/routes.js";
import { adminRoutes } from "./admin/routes.js";
import { friendRoutes } from "./friends/routes.js";
import { achievementRoutes } from "./achievements/routes.js";
import { dailyRoutes } from "./daily/routes.js";
import { emailRoutes } from "./email/routes.js";
import { supportRoutes } from "./support/routes.js";
import { Notices } from "./email/notices.js";
import { type Mailer, resendMailer } from "./email/mailer.js";
import { Presence } from "./online/presence.js";
import { APP_ORIGINS, onlineRoutes } from "./online/routes.js";
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
  /** Sends email (Resend); tests pass a fake. */
  mailer?: Mailer;
}

export async function buildApp({
  db,
  checkDb,
  webDist,
  logger = true,
  timing,
  socketMessageLimit,
  mailer = resendMailer,
}: AppOptions) {
  // trustProxy: behind Umbrel's app proxy / Cloudflare, so req.protocol reflects HTTPS.
  const app = Fastify({ logger, trustProxy: true });
  await app.register(fastifyCookie);
  // The iPhone app runs the game from its own bundle (origin capacitor://localhost) and calls this
  // server with a bearer token, never a cookie, so letting it read API responses is safe.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !APP_ORIGINS.includes(origin) || !req.url.startsWith("/api/")) return;
    reply.header("access-control-allow-origin", origin);
    reply.header("vary", "origin");
    if (req.method === "OPTIONS") {
      return reply
        .header("access-control-allow-methods", "GET, POST, PUT, DELETE")
        .header("access-control-allow-headers", `content-type, authorization, ${APP_CLIENT_HEADER}`)
        .header("access-control-max-age", "86400")
        .code(204)
        .send();
    }
  });
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Cloudflare Web Analytics (added to pages by Cloudflare when the site is behind it).
        scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
        // React and the animation library set inline style attributes. Fonts are bundled.
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        // Vite inlines small images (the card back) as data: URIs.
        imgSrc: ["'self'", "data:"],
        // The game socket is same-origin.
        connectSrc: [
          "'self'",
          // Where Cloudflare Web Analytics reports page views.
          "https://cloudflareinsights.com",
        ],
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
  const notices = new Notices(db, mailer, app.log);
  const rooms = new RoomManager(db, timing, (userId, opponent, gameId) =>
    notices.gameWaiting(userId, opponent, gameId),
  );
  app.addHook("onClose", async () => rooms.close());
  await app.register(onlineRoutes, {
    db,
    rooms,
    presence,
    messageLimit: socketMessageLimit,
    mailer,
  });
  await app.register(friendRoutes, { db, presence, notices });
  await app.register(achievementRoutes, { db });
  await app.register(dailyRoutes, { db });
  await app.register(emailRoutes, { db, mailer });
  await app.register(supportRoutes, { db, mailer });
  await app.register(adminRoutes, { db, rooms, presence });

  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      // Painted scene clips are large and rarely change: let browsers keep them for a week.
      setHeaders: (res, path) => {
        if (path.includes(`${sep}cinematics${sep}`)) {
          res.header("cache-control", "public, max-age=604800");
        }
      },
    });
    // Single-page app: unknown non-API routes fall back to index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
