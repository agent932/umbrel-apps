import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { CLASSIC_RULES, type GameState } from "@pirate/engine";
import { buildApp } from "../app.js";
import { connect } from "../db/client.js";
import { defaultMigrationsFolder, runMigrations } from "../db/migrate.js";
import { inventory, users } from "../db/schema.js";
import { type MatchInfo, recordMatch } from "../games/record.js";
import { playGame } from "../test/games.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { expectPurchasesMatch, inventoryOf, setShopOpen } from "../test/shop.js";
import { signUp } from "../test/testApp.js";
import { credit } from "./wallet.js";

/**
 * Real Postgres runs transactions side by side, so these check the locks and unique keys that
 * PGlite (one transaction at a time) can't. Opt in with TEST_DATABASE_URL: a server where the
 * tests may create and drop a scratch database. CI's test job has one, so they run on every pull
 * request. By hand: `npm run db:up`, then
 * TEST_DATABASE_URL=postgres://pirate:pirate@localhost:5432/pirate_cribbage npx vitest run races
 */
const url = process.env.TEST_DATABASE_URL;

// On CI a skip would let a missing lock through unnoticed.
it.runIf(!url && !!process.env.CI)("has a real Postgres on CI", () => {
  expect.fail("Set TEST_DATABASE_URL: the CI test job's Postgres runs these races");
});

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

  let signups = 0;
  /** A new player. Each signs up from its own address, so the signup limit never trips. */
  async function player(username: string) {
    const { cookie } = await signUp(app, username, `198.51.100.${++signups}`);
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

  describe("the shop", () => {
    /** An admin who never shops (the only admin can't delete their account). */
    let purser: { id: string; cookie: string };
    beforeAll(async () => {
      purser = await player("RacePurser");
      await conn.db.update(users).set({ isAdmin: true }).where(eq(users.id, purser.id));
      await setShopOpen(conn.db, true);
    });

    async function shopper(username: string, doubloons: number) {
      const p = await player(username);
      await credit(conn.db, p.id, doubloons, "admin", randomUUID());
      return p;
    }
    const buy = (cookie: string, itemId: string, price: number) =>
      app.inject({
        method: "POST",
        url: "/api/shop/buy",
        headers: { cookie },
        payload: { itemId, price },
      });
    const deleteAccount = (cookie: string) =>
      app.inject({
        method: "POST",
        url: "/api/auth/delete",
        headers: { cookie },
        payload: { password: "parrots-and-rum" },
      });

    /** Resolves once a query on the scratch database is waiting for a lock. */
    async function someoneWaits() {
      for (let i = 0; i < 250; i++) {
        const [row] = await server<{ n: number }[]>`
          select count(*)::int as n from pg_stat_activity
          where datname = ${name} and wait_event_type = 'Lock'`;
        if (row!.n > 0) return;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("Nothing waited for a lock");
    }

    /** A transaction that runs `work`, then stays open (holding its locks) until released. */
    function held(
      work: (tx: Parameters<Parameters<typeof conn.db.transaction>[0]>[0]) => Promise<unknown>,
    ) {
      let release!: () => void;
      let ready!: () => void;
      const released = new Promise<void>((r) => (release = r));
      const started = new Promise<void>((r) => (ready = r));
      const done = conn.db.transaction(async (tx) => {
        await work(tx);
        ready();
        await released;
      });
      return { started, release, done };
    }

    it("charges once when five buys of the same item land at the same moment", async () => {
      const finn = await shopper("RaceFinn", 5000);
      const all = await Promise.all(
        Array.from({ length: 5 }, () => buy(finn.cookie, "board.treasure-map", 1500)),
      );
      expect(all.map((r) => r.statusCode).sort()).toEqual([200, 409, 409, 409, 409]);
      expect(all.filter((r) => r.statusCode === 409).map((r) => r.json().code)).toEqual([
        "owned",
        "owned",
        "owned",
        "owned",
      ]);
      expect(await ledgerRows(conn.db, finn.id, "purchase")).toHaveLength(1);
      expect(await inventoryOf(conn.db, finn.id)).toEqual(["board.treasure-map"]);
      expect(await doubloonsOf(conn.db, finn.id)).toBe(3500);
      await expectLedgerMatches(conn.db);
      await expectPurchasesMatch(conn.db, finn.id);
    });

    it("sells only one of two items bought at once that together cost more than the balance", async () => {
      const gwen = await shopper("RaceGwen", 2000);
      const both = await Promise.all([
        buy(gwen.cookie, "board.krakens-reef", 1500),
        buy(gwen.cookie, "deck.ghost", 1000),
      ]);
      expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(both.find((r) => r.statusCode === 409)!.json().code).toBe("short");
      expect(await inventoryOf(conn.db, gwen.id)).toHaveLength(1);
      expect([500, 1000]).toContain(await doubloonsOf(conn.db, gwen.id));
      await expectLedgerMatches(conn.db);
      await expectPurchasesMatch(conn.db, gwen.id);
    });

    it("lands a buy and a bot win for the same player at once, without deadlock", async () => {
      const hal = await shopper("RaceHal", 1000);
      const [bought, rewards] = await Promise.all([
        buy(hal.cookie, "deck.crimson", 1000),
        finish(playGame(CLASSIC_RULES, 3), hal.id, null),
      ]);
      expect(bought.statusCode).toBe(200);
      const payout = rewards.get(hal.id)!.total;
      expect(payout).toBeGreaterThan(0);
      expect(await doubloonsOf(conn.db, hal.id)).toBe(1000 - 1000 + payout);
      await expectLedgerMatches(conn.db);
      await expectPurchasesMatch(conn.db, hal.id);
    });

    it("leaves nothing behind when an account is deleted during a buy, whichever goes first", async () => {
      // Both at once: the deletion checks the password first, so the buy usually wins.
      const ida = await shopper("RaceIda", 1500);
      const [bought, deleted] = await Promise.all([
        buy(ida.cookie, "board.ghost-ship", 1500),
        deleteAccount(ida.cookie),
      ]);
      expect(deleted.statusCode).toBe(200);
      expect([200, 401]).toContain(bought.statusCode);

      // The deletion first: its row lock is held while the buy arrives and waits for it.
      const jem = await shopper("RaceJem", 1500);
      const deleting = held((tx) => tx.delete(users).where(eq(users.id, jem.id)));
      await deleting.started;
      const late = buy(jem.cookie, "board.ghost-ship", 1500);
      await someoneWaits();
      deleting.release();
      await deleting.done;
      expect((await late).statusCode).toBe(401);

      for (const p of [ida, jem]) {
        expect(await doubloonsOf(conn.db, p.id)).toBeUndefined();
        expect(await inventoryOf(conn.db, p.id)).toEqual([]);
        expect(await ledgerRows(conn.db, p.id)).toEqual([]);
      }
      await expectLedgerMatches(conn.db);
    });

    it("never goes below zero when a buy and an admin removal land at once", async () => {
      const kit = await shopper("RaceKit", 2000);
      const [bought, removed] = await Promise.all([
        buy(kit.cookie, "board.royal-navy", 1500),
        app.inject({
          method: "POST",
          url: `/api/admin/users/${kit.id}/doubloons`,
          headers: { cookie: purser.cookie },
          payload: { delta: -1000, note: "Race test", requestId: randomUUID() },
        }),
      ]);
      expect([bought.statusCode, removed.statusCode].sort()).toEqual([200, 409]);
      expect(await doubloonsOf(conn.db, kit.id)).toBe(bought.statusCode === 200 ? 500 : 1000);
      await expectLedgerMatches(conn.db);
      await expectPurchasesMatch(conn.db, kit.id);
    });

    it("never charges without adding the item when a grant that skips the wallet lock races a buy", async () => {
      // The grant's row isn't committed yet when the buy tries to add its own: the buy waits for
      // it, adds nothing and charges nothing.
      const lea = await shopper("RaceLea", 1000);
      const grant = held((tx) =>
        tx.insert(inventory).values({ userId: lea.id, itemId: "deck.treasure" }),
      );
      await grant.started;
      const buying = buy(lea.cookie, "deck.treasure", 1000);
      await someoneWaits();
      grant.release();
      await grant.done;
      const res = await buying;
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("owned");
      expect(await ledgerRows(conn.db, lea.id, "purchase")).toEqual([]);
      expect(await doubloonsOf(conn.db, lea.id)).toBe(1000);
      expect(await inventoryOf(conn.db, lea.id)).toEqual(["deck.treasure"]);

      // At the same moment: whichever wins, a charge always comes with the buy's own new row.
      const mo = await shopper("RaceMo", 1000);
      const [, raced] = await Promise.all([
        conn.db
          .insert(inventory)
          .values({ userId: mo.id, itemId: "deck.ships-wheel" })
          .onConflictDoNothing(),
        buy(mo.cookie, "deck.ships-wheel", 1000),
      ]);
      const outcome = {
        status: raced.statusCode,
        code: raced.json().code,
        purchases: (await ledgerRows(conn.db, mo.id, "purchase")).length,
        doubloons: await doubloonsOf(conn.db, mo.id),
      };
      expect([
        { status: 200, code: undefined, purchases: 1, doubloons: 0 },
        { status: 409, code: "owned", purchases: 0, doubloons: 1000 },
      ]).toContainEqual(outcome);
      expect(await inventoryOf(conn.db, mo.id)).toEqual(["deck.ships-wheel"]);
      await expectLedgerMatches(conn.db);
    });
  });
});
