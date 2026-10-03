import type { FastifyInstance } from "fastify";
import { IllegalActionError } from "@pirate/engine";
import type { Db } from "../db/client.js";
import { areFriends } from "../friends/friends.js";
import { Matchmaker } from "./matchmaker.js";
import type { Presence } from "./presence.js";
import { ClientMessage, type ServerMessage } from "./protocol.js";
import { type Client, RoomError, type RoomManager } from "./rooms.js";

export async function onlineRoutes(
  app: FastifyInstance,
  { db, rooms, presence }: { db: Db; rooms: RoomManager; presence: Presence },
) {
  const matchmaker = new Matchmaker(rooms, presence, (a, b) => areFriends(db, a, b));

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
    const client: Client = {
      send: (m) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(m));
      },
    };
    const watching = new Set<string>();
    const seeker = { userId: user.id, username: user.username, client };

    socket.on("message", async (raw) => {
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
          case "cancelInvite":
            matchmaker.cancel(client);
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
    socket.on("close", () => {
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
    } catch (e) {
      req.log.error(e);
      client.send({ t: "error", message: "Something went wrong" });
      socket.close(1011, "server error");
    }
  });
}
