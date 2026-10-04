import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { IllegalActionError } from "@pirate/engine";
import type { Db } from "../db/client.js";
import { areFriends } from "../friends/friends.js";
import { Matchmaker } from "./matchmaker.js";
import type { Presence } from "./presence.js";
import { ClientMessage, type ServerMessage } from "./protocol.js";
import { type Client, RoomError, type RoomManager } from "./rooms.js";
import { type Mailer, emailSettings, simpleEmail } from "../email/mailer.js";

/** A real player sends a few messages a second at most. */
const KEEP_ALIVE_MS = 30_000;

export const MAX_MESSAGES_PER_10S = 60;

/** Where the iPhone app's bundled pages come from. It signs in with a token, not a cookie. */
export const APP_ORIGINS = ["capacitor://localhost"];

/**
 * Whether a socket's Origin header matches the host it connected to. No Origin means it isn't a
 * browser (scripts, the iPhone app), which can't borrow a player's cookie from another site.
 */
export function sameOrigin(
  origin: string | undefined,
  headers: Record<string, string | string[] | undefined>,
) {
  if (!origin || APP_ORIGINS.includes(origin)) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [headers.host, headers["x-forwarded-host"]].flat().filter(Boolean) as string[];
  return hosts.some((h) => h.split(",")[0]!.trim() === originHost);
}

export async function onlineRoutes(
  app: FastifyInstance,
  {
    db,
    rooms,
    presence,
    messageLimit = MAX_MESSAGES_PER_10S,
    mailer,
  }: {
    db: Db;
    rooms: RoomManager;
    presence: Presence;
    messageLimit?: number;
    mailer: Mailer;
  },
) {
  const matchmaker = new Matchmaker(rooms, presence, (a, b) => areFriends(db, a, b));

  /** Email a friend the link to your open invite. */
  app.post(
    "/api/invites/email",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: "Sign in first" });
      const body = z
        .object({ code: z.string().max(20), to: z.string().trim().toLowerCase().email().max(254) })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "That email doesn't look right" });
      const host = matchmaker.inviteHost(body.data.code);
      if (!host || host.userId !== req.user.id) {
        return reply.code(400).send({ error: "That invite has expired; make a new one" });
      }
      const config = await emailSettings(db);
      if (!config) return reply.code(400).send({ error: "Email isn't set up on this server" });
      try {
        await mailer(
          config,
          simpleEmail({
            to: body.data.to,
            subject: `${req.user.username} invites you to a game of Pirate Cribbage`,
            lines: [
              `Ahoy! ${req.user.username} has dealt you in for a game of Pirate Cribbage on Deckhand Games.`,
              "The invite is good for an hour. You'll need a free account to play.",
            ],
            button: {
              label: "Join the game",
              url: `${config.siteUrl}/join/${body.data.code.toUpperCase()}`,
            },
          }),
        );
      } catch (e) {
        req.log.error(e);
        return reply.code(502).send({ error: "Couldn't send the email; try again" });
      }
      return { ok: true };
    },
  );

  app.get("/api/online/active", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Sign in first" });
    return { games: await rooms.activeFor(req.user.id) };
  });

  app.get("/api/ws", { websocket: true }, async (socket, req) => {
    const user = req.user;
    if (!user) {
      socket.send(JSON.stringify({ t: "error", message: "Sign in first" } satisfies ServerMessage));
      socket.close(4401, "unauthorized");
      return;
    }
    // Only the game's own pages may open a socket with the player's cookie. Another site on the
    // same domain (e.g. a different app at *.atomicit.ca) could otherwise act as them.
    if (!sameOrigin(req.headers.origin, req.headers)) {
      socket.close(4403, "forbidden origin");
      return;
    }
    const client: Client = {
      send: (m) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m));
      },
      close: (code, reason) => socket.close(code, reason),
    };
    // A real player sends a few messages a second at most; hang up on floods.
    let windowStart = Date.now();
    let inWindow = 0;
    const watching = new Set<string>();
    const seeker = { userId: user.id, username: user.username, avatar: user.avatar, client };

    socket.on("message", async (raw) => {
      if (Date.now() - windowStart > 10_000) {
        windowStart = Date.now();
        inWindow = 0;
      }
      if (++inWindow > messageLimit) {
        client.send({ t: "error", message: "Slow down, matey" });
        socket.close(4429, "too many messages");
        return;
      }
      let gameId: string | undefined;
      try {
        const parsed = ClientMessage.safeParse(JSON.parse(String(raw)));
        if (!parsed.success) return client.send({ t: "error", message: "Unrecognised message" });
        const msg = parsed.data;
        gameId = "gameId" in msg ? msg.gameId : undefined;
        switch (msg.t) {
          case "queue":
            await matchmaker.queue(seeker, msg.menu);
            break;
          case "createInvite":
            matchmaker.createInvite(seeker, msg.menu);
            break;
          case "cancelQueue":
            matchmaker.cancel(client);
            break;
          case "cancelInvite":
            matchmaker.cancel(client);
            matchmaker.cancelInvites(user.id);
            break;
          case "joinInvite":
            await matchmaker.joinInvite(seeker, msg.code);
            break;
          case "watch":
            await rooms.join(msg.gameId, user.id, client);
            watching.add(msg.gameId);
            break;
          case "act":
            await rooms.act(msg.gameId, user.id, msg.action);
            break;
          case "forfeit":
            await rooms.forfeitByUser(msg.gameId, user.id);
            break;
          case "challenge":
            await matchmaker.challenge(seeker, msg.friendId, msg.menu);
            break;
          case "acceptChallenge":
            await matchmaker.acceptChallenge(seeker, msg.challengeId);
            break;
          case "emote":
            await rooms.emote(msg.gameId, user.id, msg.emote);
            break;
          case "rematch":
            await matchmaker.rematch(seeker, msg.gameId);
            break;
          case "declineChallenge":
            matchmaker.declineChallenge(seeker, msg.challengeId);
            break;
        }
      } catch (e) {
        // Rule and room errors are meant for the player; anything else stays in the server log.
        const known = e instanceof IllegalActionError || e instanceof RoomError;
        client.send({ t: "error", message: known ? e.message : "Something went wrong", gameId });
        if (!known) req.log.error(e);
      }
    });

    presence.add(user.id, client);
    // Proxies such as Cloudflare drop connections that are quiet for ~100s (a host waiting on
    // their invite screen, a slow thinker); a ping every 30s keeps them open.
    const keepAlive = setInterval(() => {
      if (socket.readyState === socket.OPEN) socket.ping();
    }, KEEP_ALIVE_MS);
    socket.on("close", () => {
      clearInterval(keepAlive);
      presence.remove(user.id, client);
      matchmaker.cancel(client);
      for (const id of watching) rooms.leave(id, client);
    });

    try {
      client.send({
        t: "hello",
        username: user.username,
        activeGames: await rooms.activeFor(user.id),
      });
      matchmaker.deliverPending(user.id, client);
    } catch (e) {
      req.log.error(e);
      client.send({ t: "error", message: "Something went wrong" });
      socket.close(1011, "server error");
    }
  });
}
