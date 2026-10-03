import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { tierFor } from "@pirate/engine";
import { z } from "zod";
import { hashPassword } from "../auth/password.js";
import { parseBody } from "../auth/routes.js";
import { deleteUserSessions } from "../auth/sessions.js";
import type { Db } from "../db/client.js";
import { games, matchPlayers, matches, users } from "../db/schema.js";
import type { Presence } from "../online/presence.js";
import type { RoomManager } from "../online/rooms.js";
import { currentSeason, endSeason } from "../seasons/seasons.js";

function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    void reply.code(401).send({ error: "Sign in first" });
    return null;
  }
  if (!req.user.isAdmin) {
    void reply.code(403).send({ error: "Admins only" });
    return null;
  }
  return req.user;
}

/** Readable temporary password, e.g. "kraken-7QX2-bilge". */
function temporaryPassword() {
  const words = [
    "anchor",
    "bilge",
    "cutlass",
    "doubloon",
    "galleon",
    "kraken",
    "parrot",
    "rigging",
    "schooner",
    "tide",
  ];
  const pick = () => words[randomBytes(1)[0]! % words.length];
  return `${pick()}-${randomBytes(3).toString("hex").toUpperCase()}-${pick()}`;
}

export async function adminRoutes(
  app: FastifyInstance,
  { db, rooms, presence }: { db: Db; rooms: RoomManager; presence: Presence },
) {
  /** Every admin change goes in the server log, with who did it. */
  const audit = (req: FastifyRequest, action: string, details: object) =>
    req.log.info({ admin: req.user?.username, action, ...details }, `admin: ${action}`);

  app.get("/api/admin/overview", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [players] = await db.select({ n: count() }).from(users);
    const [newPlayers] = await db
      .select({ n: count() })
      .from(users)
      .where(gte(users.createdAt, weekAgo));
    const [disabled] = await db
      .select({ n: count() })
      .from(users)
      .where(sql`${users.disabledAt} is not null`);
    const byMode = await db
      .select({ mode: matches.mode, n: count() })
      .from(matches)
      .where(gte(matches.endedAt, dayAgo))
      .groupBy(matches.mode);
    const [allMatches] = await db.select({ n: count() }).from(matches);
    const [botGames] = await db
      .select({ n: count() })
      .from(games)
      .where(and(eq(games.mode, "ai"), isNull(games.finishedAt), gte(games.updatedAt, dayAgo)));
    const season = await currentSeason(db);
    return {
      players: players!.n,
      newPlayersThisWeek: newPlayers!.n,
      disabledPlayers: disabled!.n,
      matchesTotal: allMatches!.n,
      matchesToday: Object.fromEntries(byMode.map((m) => [m.mode, m.n])),
      liveOnlineGames: rooms.list().length,
      liveBotGames: botGames!.n,
      season,
      version: process.env.APP_VERSION ?? "dev",
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  app.get<{ Querystring: { q?: string } }>("/api/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query.q ?? "").trim().slice(0, 50);
    const played = db
      .select({ userId: matchPlayers.userId, n: count().as("n") })
      .from(matchPlayers)
      .groupBy(matchPlayers.userId)
      .as("played");
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        rating: users.rating,
        rankedGames: users.rankedGames,
        isAdmin: users.isAdmin,
        disabledAt: users.disabledAt,
        createdAt: users.createdAt,
        matches: sql<number>`coalesce(${played.n}, 0)`.mapWith(Number),
      })
      .from(users)
      .leftJoin(played, eq(played.userId, users.id))
      .where(q ? or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(100);
    return {
      users: rows.map((u) => ({
        ...u,
        tier: tierFor(u.rating).name,
        online: presence.isOnline(u.id),
      })),
    };
  });

  const Target = z.object({ id: z.string().uuid() });

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/disable", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const { id } = Target.parse(req.params);
    if (id === admin.id)
      return reply.code(400).send({ error: "You can't disable your own account" });
    const res = await db
      .update(users)
      .set({ disabledAt: new Date() })
      .where(eq(users.id, id))
      .returning({ username: users.username });
    if (!res[0]) return reply.code(404).send({ error: "No such player" });
    await deleteUserSessions(db, id);
    audit(req, "disable", { player: res[0].username });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/enable", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = Target.parse(req.params);
    const res = await db
      .update(users)
      .set({ disabledAt: null })
      .where(eq(users.id, id))
      .returning({ username: users.username });
    if (!res[0]) return reply.code(404).send({ error: "No such player" });
    audit(req, "enable", { player: res[0].username });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/users/:id/admin", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const { id } = Target.parse(req.params);
    const body = parseBody(z.object({ isAdmin: z.boolean() }), req.body, reply);
    if (!body) return;
    // Never leave the app without an admin.
    if (id === admin.id && !body.isAdmin)
      return reply.code(400).send({ error: "You can't remove your own admin role" });
    const res = await db
      .update(users)
      .set({ isAdmin: body.isAdmin })
      .where(eq(users.id, id))
      .returning({ username: users.username });
    if (!res[0]) return reply.code(404).send({ error: "No such player" });
    audit(req, body.isAdmin ? "promote" : "demote", { player: res[0].username });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/reset-password",
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { id } = Target.parse(req.params);
      const password = temporaryPassword();
      const res = await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, id))
        .returning({ username: users.username });
      if (!res[0]) return reply.code(404).send({ error: "No such player" });
      await deleteUserSessions(db, id);
      audit(req, "reset-password", { player: res[0].username });
      // Shown once to the admin to pass on; the player should change it after signing in.
      return { temporaryPassword: password };
    },
  );

  app.get("/api/admin/games", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { games: rooms.list() };
  });

  app.post<{ Params: { id: string } }>("/api/admin/games/:id/end", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = Target.parse(req.params);
    if (!(await rooms.abort(id))) return reply.code(404).send({ error: "That game isn't running" });
    audit(req, "end-game", { gameId: id });
    return { ok: true };
  });

  app.post("/api/admin/seasons/end", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const result = await endSeason(db);
    audit(req, "end-season", { ended: result.ended.name, players: result.ended.players });
    return result;
  });
}
