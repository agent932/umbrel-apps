import type { FastifyInstance } from "fastify";
import { tierFor } from "@pirate/engine";
import { and, desc, gt } from "drizzle-orm";
import { z } from "zod";
import { parseBody, requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import type { Presence } from "../online/presence.js";
import { currentSeason, listSeasons, seasonStandings } from "../seasons/seasons.js";
import { headToHead } from "../stats/stats.js";
import {
  FriendError,
  acceptFriend,
  areFriends,
  listFriends,
  removeFriend,
  requestFriend,
} from "./friends.js";

export async function friendRoutes(
  app: FastifyInstance,
  { db, presence }: { db: Db; presence: Presence },
) {
  const withPresence = <T extends { id: string; rating: number }>(f: T) => ({
    ...f,
    online: presence.isOnline(f.id),
    tier: tierFor(f.rating).name,
  });

  app.get("/api/friends", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const lists = await listFriends(db, user.id);
    return {
      friends: lists.friends.map(withPresence),
      incoming: lists.incoming.map(withPresence),
      outgoing: lists.outgoing.map(withPresence),
    };
  });

  app.post("/api/friends/requests", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(z.object({ username: z.string().min(1).max(40) }), req.body, reply);
    if (!body) return;
    try {
      const { friend, accepted } = await requestFriend(db, user.id, body.username);
      presence.notify(friend.id, { t: "friends" });
      return reply.code(201).send({ friend: withPresence(friend), accepted });
    } catch (e) {
      if (e instanceof FriendError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  app.post<{ Params: { id: string } }>("/api/friends/requests/:id/accept", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    try {
      await acceptFriend(db, user.id, req.params.id);
      presence.notify(req.params.id, { t: "friends" });
      return { ok: true };
    } catch (e) {
      if (e instanceof FriendError) return reply.code(404).send({ error: e.message });
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/friends/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    await removeFriend(db, user.id, req.params.id);
    presence.notify(req.params.id, { t: "friends" });
    return { ok: true };
  });

  /** Your record against one friend (online games between the two of you). */
  app.get<{ Params: { id: string } }>("/api/friends/:id/stats", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (!(await areFriends(db, user.id, req.params.id)))
      return reply.code(404).send({ error: "Not a friend" });
    return { stats: await headToHead(db, user.id, req.params.id) };
  });

  app.get("/api/leaderboard", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        rating: users.rating,
        rankedGames: users.rankedGames,
      })
      .from(users)
      .where(and(gt(users.rankedGames, 0)))
      .orderBy(desc(users.rating), users.username)
      .limit(50);
    return {
      season: await currentSeason(db),
      players: rows.map((r, i) => ({ ...r, rank: i + 1, tier: tierFor(r.rating).name })),
    };
  });

  app.get("/api/seasons", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { seasons: await listSeasons(db) };
  });

  /** Final standings of a finished season. */
  app.get<{ Params: { id: string } }>("/api/seasons/:id/standings", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: "Bad season" });
    const rows = await seasonStandings(db, id.data);
    return { standings: rows.map((r) => ({ ...r, tier: tierFor(r.rating).name })) };
  });
}
