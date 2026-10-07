import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, count, desc, eq, gt, gte, ilike, isNull, ne, or, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ADMIN_MAX_DELTA, tierFor, utcDayStart } from "@pirate/engine";
import { z } from "zod";
import { hashPassword } from "../auth/password.js";
import { parseBody } from "../auth/routes.js";
import { deleteUserSessions } from "../auth/sessions.js";
import type { Db } from "../db/client.js";
import { games, matchPlayers, matches, users, walletLedger } from "../db/schema.js";
import { OverdrawError, credit, lockWallets } from "../economy/wallet.js";
import type { Presence } from "../online/presence.js";
import type { RoomManager } from "../online/rooms.js";
import { currentSeason, endSeason } from "../seasons/seasons.js";

export function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
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
    // Doubloons earned by play today (UTC), to spot farming. Admin adjustments aren't counted.
    const earnedToday = and(
      gte(walletLedger.createdAt, utcDayStart(new Date())),
      gt(walletLedger.delta, 0),
      ne(walletLedger.reason, "admin"),
    );
    const earned = sum(walletLedger.delta).mapWith(Number);
    const [issued] = await db.select({ n: earned }).from(walletLedger).where(earnedToday);
    const topEarners = await db
      .select({ id: users.id, username: users.username, doubloons: earned })
      .from(walletLedger)
      .innerJoin(users, eq(users.id, walletLedger.userId))
      .where(earnedToday)
      .groupBy(users.id, users.username)
      .orderBy(desc(earned), users.username)
      .limit(5);
    return {
      players: players!.n,
      newPlayersThisWeek: newPlayers!.n,
      disabledPlayers: disabled!.n,
      matchesTotal: allMatches!.n,
      matchesToday: Object.fromEntries(byMode.map((m) => [m.mode, m.n])),
      liveOnlineGames: rooms.list().length,
      liveBotGames: botGames!.n,
      doubloonsIssuedToday: issued?.n ?? 0,
      topEarnersToday: topEarners,
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
        doubloons: users.doubloons,
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
    // Also hang up any game or lobby they're connected to right now.
    presence.disconnect(id, "This account has been disabled");
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

  const AdjustBody = z.object({
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, "Enter an amount other than 0")
      .refine((n) => Math.abs(n) <= ADMIN_MAX_DELTA, "At most 100,000 at a time"),
    note: z.string().trim().min(1, "Say why").max(200),
    /** Made by the browser for each adjustment; a retry with the same id changes nothing. */
    requestId: z.string().uuid(),
  });

  /** Add or remove a player's doubloons (any admin, their own included), with a reason. */
  app.post<{ Params: { id: string } }>("/api/admin/users/:id/doubloons", async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;
    const target = Target.safeParse(req.params);
    if (!target.success) return reply.code(404).send({ error: "No such player" });
    const body = parseBody(AdjustBody, req.body, reply);
    if (!body) return;
    const { id } = target.data;
    let done: { username: string; paid: boolean; balance: number } | null;
    try {
      done = await db.transaction(async (tx) => {
        const [row] = await lockWallets(tx, [id]);
        if (!row) return null;
        const result = await credit(tx, id, body.delta, "admin", body.requestId, {
          note: body.note,
          actorId: admin.id,
        });
        return { username: row.username, ...result };
      });
    } catch (err) {
      if (err instanceof OverdrawError)
        return reply.code(409).send({ error: "That would take their doubloons below zero" });
      throw err;
    }
    if (!done) return reply.code(404).send({ error: "No such player" });
    // A retry of the same request has already been made and logged.
    if (done.paid) {
      audit(req, "adjust-doubloons", {
        player: done.username,
        delta: body.delta,
        note: body.note,
        balance: done.balance,
      });
    }
    return { doubloons: done.balance };
  });

  /** A player's latest doubloon changes, with admin notes and who made them. */
  app.get<{ Params: { id: string } }>("/api/admin/users/:id/ledger", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const target = Target.safeParse(req.params);
    if (!target.success) return reply.code(404).send({ error: "No such player" });
    const actor = alias(users, "actor");
    const rows = await db
      .select({
        id: walletLedger.id,
        delta: walletLedger.delta,
        reason: walletLedger.reason,
        ref: walletLedger.refId,
        note: walletLedger.note,
        actor: actor.username,
        createdAt: walletLedger.createdAt,
      })
      .from(walletLedger)
      .leftJoin(actor, eq(actor.id, walletLedger.actorId))
      .where(eq(walletLedger.userId, target.data.id))
      .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
      .limit(100);
    return { rows };
  });

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
