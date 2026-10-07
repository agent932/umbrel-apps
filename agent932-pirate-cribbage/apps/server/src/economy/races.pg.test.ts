import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { CLASSIC_RULES, type GameState } from "@pirate/engine";
import { buildApp } from "../app.js";
import { connect } from "../db/client.js";
import { defaultMigrationsFolder, runMigrations } from "../db/migrate.js";
import { users } from "../db/schema.js";
import { type MatchInfo, recordMatch } from "../games/record.js";
import { playGame } from "../test/games.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { signUp } from "../test/testApp.js";
import { credit } from "./wallet.js";

/**
 * Real Postgres runs transactions side by side, so these check the locks and unique keys that
 * PGlite (one transaction at a time) can't. Opt in with TEST_DATABASE_URL: a server where the
 * tests may create and drop a scratch database. For example, `npm run db:up`, then
 * TEST_DATABASE_URL=postgres://pirate:pirate@localhost:5432/pirate_cribbage npx vitest run races
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("doubloon races on real Postgres", () => {
  const name = `pc_races_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  let server: postgres.Sql;
  let conn: ReturnType<typeof connect>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    server = postgres(url!, { max: 1, onnotice: () => {} });
    await server.unsafe(`create database ${name}`);
    const scratch = new URL(url!);
    scratch.pathname = `/${name}`;
    conn = connect(scratch.toString());
    await runMigrations(conn.db, defaultMigrationsFolder);
    app = await buildApp({
      db: conn.db,
      checkDb: async () => true,
      logger: false,
      mailer: async () => {},
    });
  });

  afterAll(async () => {
    await app?.close();
    await conn?.close();
    await server?.unsafe(`drop database if exists ${name}`);
    await server?.end();
  });

  async function player(username: string) {
    const { cookie } = await signUp(app, username);
    const [u] = await conn.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    return { id: u!.id, cookie };
  }

  /** Record `state` in its own transaction, with `winner` in the winning seat. */
  const finish = (
    state: GameState,
    winner: string,
    loser: string | null,
    info: Partial<MatchInfo> = {},
  ) =>
    conn.db.transaction((tx) =>
      recordMatch(
        tx,
        {
          id: randomUUID(),
          mode: "ai",
          aiLevel: "medium",
          createdAt: new Date(Date.now() - 10 * 60_000),
          ...info,
        },
        state.winner === 0 ? [winner, loser] : [loser, winner],
        state,
      ),
    );

  it("pays an event once when five transactions credit it at the same moment", async () => {
    const anne = await player("RaceAnne");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        conn.db.transaction((tx) => credit(tx, anne.id, 25, "daily", "2026-10-06")),
      ),
    );
    expect(results.filter((r) => r.paid)).toHaveLength(1);
    expect(await ledgerRows(conn.db, anne.id)).toHaveLength(1);
    expect(await doubloonsOf(conn.db, anne.id)).toBe(25);
    await expectLedgerMatches(conn.db);
  });

  it("pays exactly 10 bot wins when the 10th and 11th finish at the same moment", async () => {
    const bonny = await player("RaceBonny");
    for (let i = 0; i < 9; i++) await credit(conn.db, bonny.id, 35, "botWin", randomUUID());
    const state = playGame(CLASSIC_RULES, 3);
    const both = await Promise.all([finish(state, bonny.id, null), finish(state, bonny.id, null)]);
    expect(await ledgerRows(conn.db, bonny.id, "botWin")).toHaveLength(10);
    expect(both.map((r) => r.get(bonny.id)!.note).sort()).toEqual(["botCap", null]);
    await expectLedgerMatches(conn.db);
  });

  it("pays only the 3rd of two wins over the same opponent finishing at once, without deadlock", async () => {
    const cara = await player("RaceCara");
    const dot = await player("RaceDot");
    // Cara wins from seat 0 in one game and seat 1 in the other, so the locks are asked for in
    // opposite seat order.
    const games = [playGame(CLASSIC_RULES, 3), playGame(CLASSIC_RULES, 1)];
    expect(games.map((g) => g.winner).sort()).toEqual([0, 1]);
    const online = { mode: "online", aiLevel: null } as const;
    await finish(games[0]!, cara.id, dot.id, online);
    await finish(games[1]!, cara.id, dot.id, { ...online, ranked: true });
    const both = await Promise.all([
      finish(games[0]!, cara.id, dot.id, online),
      finish(games[1]!, cara.id, dot.id, { ...online, ranked: true }),
    ]);
    const notes = both.map((r) => r.get(cara.id)!.note).sort();
    expect(notes).toEqual([null, "sameOpponent"]);
    const paid = [
      ...(await ledgerRows(conn.db, cara.id, "onlineWin")),
      ...(await ledgerRows(conn.db, cara.id, "rankedWin")),
    ];
    expect(paid).toHaveLength(3);
    await expectLedgerMatches(conn.db);
  });

  it("refuses one of two admin removals that together would go below zero", async () => {
    const captain = await player("RaceCaptain");
    await conn.db.update(users).set({ isAdmin: true }).where(eq(users.id, captain.id));
    const eve = await player("RaceEve");
    const adjust = (delta: number) =>
      app.inject({
        method: "POST",
        url: `/api/admin/users/${eve.id}/doubloons`,
        headers: { cookie: captain.cookie },
        payload: { delta, note: "Race test", requestId: randomUUID() },
      });
    expect((await adjust(500)).statusCode).toBe(200);
    const both = await Promise.all([adjust(-300), adjust(-300)]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await doubloonsOf(conn.db, eve.id)).toBe(200);
    expect(await ledgerRows(conn.db, eve.id)).toHaveLength(2);
    await expectLedgerMatches(conn.db);
  });
});
