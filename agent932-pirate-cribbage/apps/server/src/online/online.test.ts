import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_COSMETICS, type Seat } from "@pirate/engine";
import { games, matchPlayers, matches, users, walletLedger } from "../db/schema.js";
import { credit } from "../economy/wallet.js";
import { expectLedgerMatches } from "../test/ledger.js";
import { expectPurchasesMatch, giveAndUse, setShopOpen } from "../test/shop.js";
import { signUp, testApp } from "../test/testApp.js";
import {
  LONG,
  type StateMsg,
  type TestClient,
  connect,
  matchedPair,
  move,
  nextMove,
  playOut,
  readyForNext,
} from "../test/wsClient.js";
import type { ServerMessage } from "./protocol.js";
import type { Timing } from "./rooms.js";

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

/** A fresh app with the given clocks, and two matched players on it. */
async function pair(timing: Timing = LONG, variant: "classic" | "pirate" = "classic") {
  t = await testApp(undefined, timing);
  return matchedPair(t, { variant });
}

describe("online play", () => {
  it("refuses connections without a session", async () => {
    t = await testApp();
    const c = await connect(t.app);
    expect(await c.next((m) => m.t === "error")).toMatchObject({ message: "Sign in first" });
    expect(await c.closed).toBe(4401);
  });

  it("shows both players' crew portraits", async () => {
    t = await testApp(undefined, LONG);
    const { sa, sb } = await matchedPair(t, { variant: "classic" }, ["Anne", "Bonny"], [5, null]);
    const anneSeat = sa.names.indexOf("Anne");
    expect(sa.avatars[anneSeat]).toBe(5);
    expect(sa.avatars[1 - anneSeat]).toBeNull();
    expect(sb.avatars).toEqual(sa.avatars);
  });

  it("pairs two players through Quick Match and shows each only their own hand", async () => {
    const { gameId, a, b, sa, sb } = await pair();
    expect(new Set([sa.seat, sb.seat])).toEqual(new Set([0, 1]));
    expect(sa.names).toEqual(sb.names);
    expect([...sa.names].sort()).toEqual(["Anne", "Bonny"]);
    // Bonny joined second, so her first state shows both players connected.
    expect(sb.online).toEqual([true, true]);
    // The game opens with both players cutting for deal.
    expect(sa.step.view.phase).toBe("cutForDeal");
    for (const c of [a, b]) await move(c, gameId, nextMove(c.latestState()!.step.view, false)!);
    let la = a.latestState()!;
    for (let i = 0; la.step.view.phase === "cutForDeal" && i < 20; i++) {
      // A tied cut: both cut again.
      for (const c of [a, b]) {
        const m = nextMove(c.latestState()!.step.view, false);
        if (m) await move(c, gameId, m);
      }
      la = a.latestState()!;
    }
    const lb = b.latestState()!;
    for (const s of [la, lb]) {
      expect(s.step.view.phase).toBe("discard");
      expect(s.step.view.hand).toHaveLength(6);
      expect(s.step.view).not.toHaveProperty("hands");
    }
    // Neither player's cards appear anywhere in what the other was sent.
    expect(JSON.stringify(b.messages)).not.toContain(JSON.stringify(la.step.view.hand));
  });

  it("only pairs players who asked for the same rules", async () => {
    t = await testApp(undefined, LONG);
    const a = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
    const b = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
    a.send({ t: "queue", menu: { variant: "classic" } });
    await a.next((m) => m.t === "queued");
    b.send({ t: "queue", menu: { variant: "pirate", powerCost: 0 } });
    await b.next((m) => m.t === "queued");
    expect(a.messages.some((m) => m.t === "matched")).toBe(false);
  });

  it("plays a whole online game and records it for both players", async () => {
    const { gameId, a, b, anne, bonny } = await pair();
    const end = await playOut(gameId, [a, b]);
    expect(end.step.view.winner).not.toBeNull();

    const stats = async (cookie: string) =>
      (await t.app.inject({ url: "/api/stats", headers: { cookie } }))
        .json()
        .buckets.find((x: { key: string }) => x.key === "online").stats;
    const sa = await stats(anne.cookie);
    const sb = await stats(bonny.cookie);
    expect(sa.matchesPlayed).toBe(1);
    expect(sb.matchesPlayed).toBe(1);
    expect(sa.wins + sb.wins).toBe(1);
    expect(sa.roundsPlayed).toBe(sb.roundsPlayed);
    // Each sees the other's averages as "opponent".
    expect(sa.hand.avg).toBeCloseTo(sb.hand.avgOpp);
  }, 60_000);

  it("plays a pirate game online", async () => {
    const { gameId, a, b } = await pair(LONG, "pirate");
    const end = await playOut(gameId, [a, b]);
    expect(end.step.view.phase).toBe("gameOver");
  }, 60_000);

  it("rejects illegal moves and moves from people not in the game", async () => {
    const { gameId, a } = await pair();
    a.send({ t: "act", gameId, action: { type: "play", card: { rank: 5, suit: "H" } } });
    expect(await a.next((m) => m.t === "error")).toMatchObject({ message: "Not time to play" });

    const c = await connect(t.app, (await signUp(t.app, "Calico")).cookie);
    c.send({ t: "watch", gameId });
    expect(await c.next((m) => m.t === "error")).toMatchObject({
      message: "You're not in that game",
    });
    c.send({ t: "act", gameId, action: { type: "cut" } });
    expect(await c.next((m) => m.t === "error")).toMatchObject({
      message: "You're not in that game",
    });
    c.send({ t: "nonsense" });
    expect(await c.next((m) => m.t === "error")).toMatchObject({ message: "Unrecognised message" });
  });

  it("starts the next round only when both players are ready", async () => {
    const { gameId, a, b } = await pair();
    // Play until the first round summary.
    for (let i = 0; i < 400; i++) {
      const phases = [a, b].map((c) => c.latestState()!.step.view.phase);
      if (phases.every((p) => p === "roundEnd" || p === "gameOver")) break;
      let moved = false;
      for (const c of [a, b]) {
        const s = c.latestState()!;
        const action = s.step.view.phase === "roundEnd" ? null : nextMove(s.step.view, false);
        if (!action) continue;
        await move(c, gameId, action);
        moved = true;
      }
      if (!moved) await new Promise((r) => setTimeout(r, 5));
    }
    if (a.latestState()!.step.view.phase !== "roundEnd") return; // game ended in round 1 (very rare)
    const mark = b.messages.length;
    await move(a, gameId, { type: "nextRound" });
    expect(await b.after(mark, (m) => m.t === "waiting")).toMatchObject({ for: "nextRound" });
    await move(b, gameId, { type: "nextRound" });
    const s = await a.next<StateMsg>(
      (m) => m.t === "state" && m.step.view.phase === "discard" && m.step.view.round === 2,
    );
    expect(s.step.view.round).toBe(2);
  }, 30_000);

  it("moves for a player who runs out of time", async () => {
    const { a, b } = await pair({ turnMs: 150, nextRoundMs: 150, disconnectMs: 60_000 });
    // Nobody discards; the server throws for them.
    expect(await a.next((m) => m.t === "timeout", 3000)).toMatchObject({ t: "timeout" });
    const s = await b.next<StateMsg>(
      (m) => m.t === "state" && m.step.events.some((e) => e.type === "discarded"),
      3000,
    );
    expect(s.step.events.length).toBeGreaterThan(0);
  });

  it("gives the game to the opponent when a player stays disconnected", async () => {
    const { gameId, a, b, sa } = await pair({
      turnMs: 60_000,
      nextRoundMs: 60_000,
      disconnectMs: 150,
    });
    const mark = b.messages.length;
    a.ws.terminate();
    const p = await b.after<Extract<ServerMessage, { t: "presence" }>>(
      mark,
      (m) => m.t === "presence",
    );
    // The opponent is told when the missing player forfeits unless they're back.
    expect(p.returnBy[sa.seat]).toBeGreaterThan(Date.now());
    expect(p.returnBy[1 - sa.seat]).toBeNull();
    const f = await b.next<Extract<ServerMessage, { t: "forfeit" }>>(
      (m) => m.t === "forfeit",
      3000,
    );
    expect(f.seat).toBe(sa.seat);
    const end = await b.next<StateMsg>((m) => m.t === "state" && m.step.view.phase === "gameOver");
    expect(end.step.view.winner).toBe(1 - sa.seat);
    const active = await t.app.inject({
      url: "/api/online/active",
      headers: { cookie: (await signUp(t.app, "Zed")).cookie },
    });
    expect(active.json().games).toEqual([]);
    void gameId;
  });

  it("lets a player reconnect in time and pick up where they left off", async () => {
    const { gameId, a, sa, anne } = await pair({
      turnMs: 60_000,
      nextRoundMs: 60_000,
      disconnectMs: 500,
    });
    a.ws.terminate();
    const again = await connect(t.app, anne.cookie);
    const hello = await again.next<Extract<ServerMessage, { t: "hello" }>>((m) => m.t === "hello");
    expect(hello.activeGames).toEqual([gameId]);
    again.send({ t: "watch", gameId });
    const s = await again.next<StateMsg>((m) => m.t === "state");
    expect(s.step.view.hand).toEqual(sa.step.view.hand);
    await new Promise((r) => setTimeout(r, 700));
    expect(again.messages.some((m) => m.t === "forfeit")).toBe(false);
  });

  it("forfeits on request", async () => {
    const { gameId, a, b, sa } = await pair();
    a.send({ t: "forfeit", gameId });
    const f = await b.next<Extract<ServerMessage, { t: "forfeit" }>>((m) => m.t === "forfeit");
    expect(f.seat).toBe(sa.seat);
  });

  describe("ranked forfeits", () => {
    const me = async (cookie: string) =>
      (await t.app.inject({ url: "/api/auth/me", headers: { cookie } })).json().user;
    const online = async (cookie: string) =>
      (await t.app.inject({ url: "/api/stats", headers: { cookie } }))
        .json()
        .buckets.find((x: { key: string }) => x.key === "online").stats;
    const over = (c: TestClient) =>
      c.next((m) => m.t === "state" && m.step.view.phase === "gameOver");

    /** Both players play on until `n` rounds are complete and the next is dealt. */
    async function playRounds(gameId: string, clients: TestClient[], n: number) {
      for (let i = 0; i < 4000; i++) {
        const [g] = await t.db
          .select({ state: games.state })
          .from(games)
          .where(eq(games.id, gameId));
        if (g!.state.phase === "discard" && g!.state.history.filter((r) => r.complete).length >= n)
          return;
        let moved = false;
        for (const c of clients) {
          const s = c.latestState();
          const action = s && nextMove(s.step.view, readyForNext(c, s));
          if (!action) continue;
          await move(c, gameId, action);
          moved = true;
        }
        if (!moved) await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(`Didn't reach ${n} rounds`);
    }

    it("moves nobody's rating for an early one, and the Ship's Log counts it", async () => {
      t = await testApp(undefined, LONG);
      const { gameId, a, b, anne, bonny } = await matchedPair(t, {
        variant: "classic",
        ranked: true,
      });
      a.send({ t: "forfeit", gameId });
      await over(b);
      for (const who of [anne, bonny])
        expect(await me(who.cookie)).toMatchObject({ rating: 1000, rankedGames: 0 });
      expect((await online(anne.cookie)).forfeits).toBe(1);
      expect((await online(bonny.cookie)).forfeits).toBe(0);
      const [row] = await t.db.select().from(matches).where(eq(matches.id, gameId));
      expect(row!.ranked).toBe(true);
    });

    it("costs rating like any loss once the game is long enough", async () => {
      t = await testApp(undefined, LONG);
      const { gameId, a, b, anne, bonny } = await matchedPair(t, {
        variant: "classic",
        ranked: true,
      });
      await playRounds(gameId, [a, b], 4);
      await t.db
        .update(games)
        .set({ createdAt: sql`now() - interval '10 minutes'` })
        .where(eq(games.id, gameId));
      a.send({ t: "forfeit", gameId });
      await over(b);
      expect(await me(anne.cookie)).toMatchObject({ rating: 984, rankedGames: 1 });
      expect(await me(bonny.cookie)).toMatchObject({ rating: 1016, rankedGames: 1 });
      expect((await online(anne.cookie)).forfeits).toBe(1);
    }, 60_000);
  });

  it("resumes a game after a server restart", async () => {
    const { gameId, sa, anne } = await pair();
    const app2 = await t.restart();
    const c = await connect(app2, anne.cookie);
    c.send({ t: "watch", gameId });
    const s = await c.next<StateMsg>((m) => m.t === "state");
    expect(s.step.view.hand).toEqual(sa.step.view.hand);
    expect([...s.names].sort()).toEqual(["Anne", "Bonny"]);
    await app2.close();
  });

  describe("doubloons", () => {
    /** Move a game's start back 10 minutes, so it's long enough to pay. */
    const backdate = (gameId: string) =>
      t.db
        .update(games)
        .set({ createdAt: sql`now() - interval '10 minutes'` })
        .where(eq(games.id, gameId));
    const gameOver = (c: TestClient) =>
      c.next<StateMsg>((m) => m.t === "state" && m.step.view.phase === "gameOver");
    /** Both players' final states, winner first. */
    async function results(a: TestClient, b: TestClient) {
      const [ea, eb] = [await gameOver(a), await gameOver(b)];
      return ea.seat === ea.step.view.winner ? [ea, eb] : [eb, ea];
    }
    const doubloons = async (cookie: string) =>
      (await t.app.inject({ url: "/api/auth/me", headers: { cookie } })).json().user.doubloons;
    const notForAchievements = (s: StateMsg) =>
      s.reward!.lines.filter((l) => l.reason !== "achievement");

    it("pays the winner, and shows each player only their own reward", async () => {
      const { gameId, a, b, anne, bonny } = await pair();
      await backdate(gameId);
      await playOut(gameId, [a, b]);
      const [won, lost] = await results(a, b);
      expect(won!.reward!.lines).toContainEqual({ reason: "onlineWin", delta: 50 });
      expect(won!.reward!.lines).toContainEqual({ reason: "firstWinOfDay", delta: 50 });
      expect(won!.reward!.note).toBeNull();
      expect(notForAchievements(lost!)).toEqual([]);
      expect(lost!.reward!.note).toBeNull();
      const paid = await t.db
        .select()
        .from(walletLedger)
        .where(eq(walletLedger.reason, "onlineWin"));
      expect(paid).toHaveLength(1);
      // Earlier states never carry a reward.
      for (const c of [a, b]) {
        const states = c.messages.filter((m): m is StateMsg => m.t === "state");
        expect(states.filter((m) => m.reward)).toHaveLength(1);
      }
      const [ea, eb] = a.latestState()!.seat === won!.seat ? [won, lost] : [lost, won];
      expect(await doubloons(anne.cookie)).toBe(ea!.reward!.balance);
      expect(await doubloons(bonny.cookie)).toBe(eb!.reward!.balance);
      await expectLedgerMatches(t.db);
    }, 60_000);

    it("pays a ranked win 60", async () => {
      t = await testApp(undefined, LONG);
      const { gameId, a, b } = await matchedPair(t, { variant: "classic", ranked: true });
      await backdate(gameId);
      await playOut(gameId, [a, b]);
      const [won] = await results(a, b);
      expect(won!.reward!.lines).toContainEqual({ reason: "rankedWin", delta: 60 });
      await expectLedgerMatches(t.db);
    }, 60_000);

    it("pays nothing for an early forfeit, to either player", async () => {
      const { gameId, a, b } = await pair();
      await backdate(gameId);
      a.send({ t: "forfeit", gameId });
      const [won, lost] = await results(a, b);
      expect(won!.seat).toBe(b.latestState()!.seat);
      // First Plunder waits for a win that pays.
      expect(won!.reward).toEqual({
        lines: [],
        total: 0,
        balance: 0,
        note: "earlyForfeit",
        unlocked: [],
      });
      expect(lost!.reward).toEqual({ lines: [], total: 0, balance: 0, note: null, unlocked: [] });
      await expectLedgerMatches(t.db);
    });

    it("pays nothing for a game under 3 minutes", async () => {
      const { gameId, a, b } = await pair();
      await playOut(gameId, [a, b]);
      const [won] = await results(a, b);
      expect(won!.reward!.note).toBe("short");
      expect(notForAchievements(won!)).toEqual([]);
      await expectLedgerMatches(t.db);
    }, 60_000);

    /** Make inserts into `table` fail: the first `times` of them, or every one. */
    async function failInserts(table: "matches" | "wallet_ledger", times = Infinity) {
      await t.db.execute(sql`create sequence boom_count`);
      const limit = Number.isFinite(times) ? String(times) : "null";
      await t.db.execute(
        sql.raw(`
        create function boom() returns trigger language plpgsql as $$
        begin
          if ${limit} is null or nextval('boom_count') <= ${limit} then raise exception 'boom'; end if;
          return new;
        end $$`),
      );
      await t.db.execute(
        sql.raw(
          `create trigger boom before insert on ${table} for each row execute function boom()`,
        ),
      );
    }
    const QUICK_AWAY: Timing = { turnMs: 60_000, nextRoundMs: 60_000, disconnectMs: 100 };

    it("keeps nothing when paying fails at the end of a game, and carries on", async () => {
      const { gameId, a, b } = await pair();
      await backdate(gameId);
      await failInserts("wallet_ledger");
      await expect(playOut(gameId, [a, b])).rejects.toThrow("Something went wrong");
      expect(await t.db.select().from(matches)).toEqual([]);
      expect(await t.db.select().from(walletLedger)).toEqual([]);
      const [game] = await t.db.select().from(games).where(eq(games.id, gameId));
      expect(game!.finishedAt).toBeNull();
      expect(game!.state.phase).not.toBe("gameOver");
      expect((await t.app.inject({ url: "/api/health" })).statusCode).toBe(200);

      // Once the fault is gone, the last move goes through and the game is paid as usual.
      await t.db.execute(sql`drop trigger boom on wallet_ledger`);
      await playOut(gameId, [a, b]);
      const [won] = await results(a, b);
      expect(won!.reward!.lines).toContainEqual({ reason: "onlineWin", delta: 50 });
      expect(await t.db.select().from(matches)).toHaveLength(1);
      await expectLedgerMatches(t.db);
    }, 60_000);

    it("tries a failed disconnect forfeit again, rather than playing the absent seat out", async () => {
      const { a, b } = await pair(QUICK_AWAY);
      const anneSeat = a.latestState()!.seat;
      await failInserts("matches", 1);
      a.ws.terminate();
      // The first forfeit fails; the clock to come back starts again, and the next one is saved.
      expect(await b.next((m) => m.t === "forfeit")).toMatchObject({ seat: anneSeat });
      const [match] = await t.db.select().from(matches);
      expect(match!.forfeitedBy).toBe(anneSeat);
      expect(match!.winner).toBe(1 - anneSeat);
    });

    it("stops after 3 failed saves in a row, and the game picks up again on rejoining", async () => {
      const { gameId, a, b } = await pair(QUICK_AWAY);
      await failInserts("matches");
      a.ws.terminate();
      // The forfeit clock runs out and fails, three times; the server says so and keeps going.
      expect(await b.next((m) => m.t === "error")).toMatchObject({
        gameId,
        message: "This game couldn't be saved. Try Resume later to finish it.",
      });
      expect(b.messages.some((m) => m.t === "forfeit")).toBe(false);
      const [game] = await t.db.select().from(games).where(eq(games.id, gameId));
      expect(game!.finishedAt).toBeNull();
      expect((await t.app.inject({ url: "/api/health" })).statusCode).toBe(200);
      // No more tries on its own.
      await new Promise((r) => setTimeout(r, 400));
      expect(b.messages.filter((m) => m.t === "error")).toHaveLength(1);

      const mark = b.messages.length;
      b.send({ t: "watch", gameId });
      const s = await b.after<StateMsg>(mark, (m) => m.t === "state");
      await expect(move(b, gameId, nextMove(s.step.view, false)!)).resolves.toBeTruthy();
    });

    it("forfeits a player's games when they delete their account, so the opponent's win counts", async () => {
      // Bonny deletes hers (Anne signed up first, so she's the only admin and can't).
      const { gameId, a, b, bonny } = await pair();
      const bonnySeat = b.latestState()!.seat;
      const res = await t.app.inject({
        method: "POST",
        url: "/api/auth/delete",
        headers: { cookie: bonny.cookie },
        payload: { password: "parrots-and-rum" },
      });
      expect(res.statusCode).toBe(200);
      expect(await a.next((m) => m.t === "forfeit")).toMatchObject({ gameId, seat: bonnySeat });
      const [match] = await t.db.select().from(matches).where(eq(matches.id, gameId));
      expect(match!.winner).toBe(1 - bonnySeat);
      // The match stays in Anne's history, without Bonny's account.
      const seats = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, gameId));
      expect(seats.find((p) => p.seat === bonnySeat)!.userId).toBeNull();
      expect(seats.find((p) => p.seat !== bonnySeat)!.userId).not.toBeNull();
    });

    it("still records a ranked game whose other player's account is already gone", async () => {
      t = await testApp(undefined, LONG);
      const { gameId, a, b } = await matchedPair(t, { variant: "classic", ranked: true });
      const anneSeat = a.latestState()!.seat;
      // Anne's account goes without the forfeit (as if deleted while the game was finishing).
      await t.db.delete(users).where(eq(users.username, "Anne"));
      b.send({ t: "forfeit", gameId });
      expect(await b.next((m) => m.t === "forfeit")).toMatchObject({ seat: 1 - anneSeat });
      const [match] = await t.db.select().from(matches).where(eq(matches.id, gameId));
      expect(match!.winner).toBe(anneSeat);
      const seats = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, gameId));
      expect(seats.find((p) => p.seat === anneSeat)!.userId).toBeNull();
      // Nobody's rating moves in a game that can't be rated.
      const [bonny] = await t.db.select().from(users).where(eq(users.username, "Bonny"));
      expect(bonny).toMatchObject({ rating: 1000, rankedGames: 0 });
      expect(b.messages.some((m) => m.t === "error")).toBe(false);
    });
  });

  describe("emotes", () => {
    it("passes a call-out to both players, but not a flood of them", async () => {
      const { gameId, a, b, sa } = await pair();
      a.send({ t: "emote", gameId, emote: "arr" });
      const seen = { gameId, seat: sa.seat, emote: "arr", t: "emote" };
      expect(await a.next((m) => m.t === "emote")).toMatchObject(seen);
      expect(await b.next((m) => m.t === "emote")).toMatchObject(seen);
      // A second one straight away is dropped; the next message Bonny sees is her own.
      a.send({ t: "emote", gameId, emote: "ahoy" });
      b.send({ t: "emote", gameId, emote: "wellPlayed" });
      expect(await b.next((m) => m.t === "emote")).toMatchObject({ emote: "wellPlayed" });
    });
  });

  describe("rematch", () => {
    it("starts a new game with the same rules once both players ask", async () => {
      const { gameId, a, b } = await pair(LONG, "pirate");
      await playOut(gameId, [a, b]);
      a.send({ t: "rematch", gameId });
      expect(await a.next((m) => m.t === "rematchWaiting")).toMatchObject({ gameId });
      expect(await b.next((m) => m.t === "rematchOffer")).toMatchObject({ gameId, from: "Anne" });
      b.send({ t: "rematch", gameId });
      const { gameId: next } = await a.next<Extract<ServerMessage, { t: "matched" }>>(
        (m) => m.t === "matched",
      );
      expect(next).not.toBe(gameId);
      expect(await b.next((m) => m.t === "matched")).toMatchObject({ gameId: next });
      b.send({ t: "watch", gameId: next });
      const s = await b.next<StateMsg>((m) => m.t === "state" && m.gameId === next);
      expect(s.step.view.rules.pirate).toBeTruthy();
    }, 60_000);

    it("isn't offered for ranked games or games still being played", async () => {
      t = await testApp(undefined, LONG);
      const { gameId, a } = await matchedPair(t, { variant: "classic", ranked: true });
      a.send({ t: "rematch", gameId });
      expect(await a.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/isn't over/),
      });
    });
  });

  describe("invites", () => {
    it("lets a friend join with the code", async () => {
      t = await testApp(undefined, LONG);
      const host = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      host.send({ t: "createInvite", menu: { variant: "pirate", powerCost: 2 } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      host.send({ t: "joinInvite", code });
      expect(await host.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/own invite/),
      });

      guest.send({ t: "joinInvite", code: code.toLowerCase() });
      const { gameId } = await guest.next<Extract<ServerMessage, { t: "matched" }>>(
        (m) => m.t === "matched",
      );
      expect(await host.next((m) => m.t === "matched")).toMatchObject({ gameId });
      guest.send({ t: "watch", gameId });
      const s = await guest.next<StateMsg>((m) => m.t === "state");
      expect(s.step.view.rules.pirate?.powerCost).toBe(2);

      // Codes work once.
      const third = await connect(t.app, (await signUp(t.app, "Calico")).cookie);
      third.send({ t: "joinInvite", code });
      expect(await third.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/expired/),
      });
    });

    it("keeps the invite when the host's phone drops its connection while sharing the link", async () => {
      t = await testApp(undefined, LONG);
      const anne = await signUp(t.app, "Anne");
      const host = await connect(t.app, anne.cookie);
      host.send({ t: "createInvite", menu: { variant: "classic" } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      // The browser goes to the background and the connection drops, then comes back.
      host.ws.terminate();
      await new Promise((r) => setTimeout(r, 50));
      const back = await connect(t.app, anne.cookie);
      await back.next((m) => m.t === "hello");

      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      guest.send({ t: "joinInvite", code });
      const { gameId } = await guest.next<Extract<ServerMessage, { t: "matched" }>>(
        (m) => m.t === "matched",
      );
      // The host hears about it on the new connection.
      expect(await back.next((m) => m.t === "matched")).toMatchObject({ gameId });
    });

    it("starts the game when the host is away, and tells them when they're back", async () => {
      t = await testApp(undefined, LONG);
      const anne = await signUp(t.app, "Anne");
      const host = await connect(t.app, anne.cookie);
      host.send({ t: "createInvite", menu: { variant: "classic" } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      host.ws.terminate();
      await new Promise((r) => setTimeout(r, 50));

      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      guest.send({ t: "joinInvite", code });
      const { gameId } = await guest.next<Extract<ServerMessage, { t: "matched" }>>(
        (m) => m.t === "matched",
      );
      guest.send({ t: "watch", gameId });
      const s = await guest.next<StateMsg>((m) => m.t === "state");
      // Anne has the usual few minutes to come back before forfeiting.
      const anneSeat = s.names.indexOf("Anne");
      expect(s.online[anneSeat]).toBe(false);
      expect(s.returnBy[anneSeat]).toBeGreaterThan(Date.now());

      const back = await connect(t.app, anne.cookie);
      expect(await back.next((m) => m.t === "matched")).toMatchObject({ gameId });
    });

    it("stops working once the host cancels it", async () => {
      t = await testApp(undefined, LONG);
      const host = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
      host.send({ t: "createInvite", menu: { variant: "classic" } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      host.send({ t: "cancelInvite" });
      await new Promise((r) => setTimeout(r, 50));
      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      guest.send({ t: "joinInvite", code });
      expect(await guest.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/expired/),
      });
    });
  });

  describe("the host's board and card backs", () => {
    type SignedUp = Awaited<ReturnType<typeof signUp>>;
    type Prepare = (anne: SignedUp, bonny: SignedUp) => Promise<void>;
    type Matched = Extract<ServerMessage, { t: "matched" }>;
    const CLASSIC = { variant: "classic" };
    /** What Anne uses in most of these tests. */
    const ANNES = { board: "board.treasure-map", deck: "deck.crimson" };
    /** What Bonny uses, when she uses anything. */
    const BONNYS = { board: "board.ghost-ship", deck: "deck.ghost" };
    const idOf = (p: SignedUp) => p.res.json().user.id as string;
    const post = (url: string, cookie: string, payload: object = {}) =>
      t.app.inject({ method: "POST", url, headers: { cookie }, payload });
    const use = (p: SignedUp, itemId: string) => post("/api/shop/use", p.cookie, { itemId });

    /** Give a player a board and backs, and have them use both. */
    async function uses(p: SignedUp, items: { board: string; deck: string }) {
      await giveAndUse(t.db, idOf(p), items.board);
      await giveAndUse(t.db, idOf(p), items.deck);
    }

    /**
     * Anne uses Treasure Map and Crimson. She signs up first, so she's an admin: the shop is
     * opened, or what she uses would be a preview only she sees.
     */
    async function anneUsesHers(anne: SignedUp) {
      await setShopOpen(t.db, true);
      await uses(anne, ANNES);
    }

    /** Anne and Bonny through Quick Match, after `prepare`. Anne waits first, so she hosts. */
    async function anneHosts(prepare: Prepare = anneUsesHers, names?: string[]) {
      t = await testApp(undefined, LONG);
      return matchedPair(t, CLASSIC, names, undefined, prepare);
    }

    /** Anne and Bonny signed up (Anne first) and connected, after `prepare`. */
    async function connected(prepare: Prepare) {
      t = await testApp(undefined, LONG);
      const anne = await signUp(t.app, "Anne");
      const bonny = await signUp(t.app, "Bonny");
      await prepare(anne, bonny);
      const a = await connect(t.app, anne.cookie);
      const b = await connect(t.app, bonny.cookie);
      await a.next((m) => m.t === "hello");
      await b.next((m) => m.t === "hello");
      return { a, b, anne, bonny };
    }

    /** Quick Match again, `first` waiting first. Nobody watches the new game yet. */
    async function queueAgain(first: TestClient, second: TestClient) {
      first.send({ t: "queue", menu: CLASSIC });
      await first.next((m) => m.t === "queued");
      second.send({ t: "queue", menu: CLASSIC });
      const { gameId } = await first.next<Matched>((m) => m.t === "matched");
      await second.next((m) => m.t === "matched");
      return gameId;
    }

    /** Quick Match again (`first` waiting first) until `first` sits in `seat`. */
    async function hostAt(seat: Seat, first: TestClient, second: TestClient, firstId: string) {
      for (let i = 0; i < 40; i++) {
        const gameId = await queueAgain(first, second);
        // Seat 0 is the game row's first player.
        const [g] = await t.db
          .select({ userId: games.userId })
          .from(games)
          .where(eq(games.id, gameId));
        if ((g!.userId === firstId ? 0 : 1) === seat) return gameId;
      }
      throw new Error(`Never got seat ${seat}`);
    }

    /** Both clients watch the game: their first states of it. */
    async function watch(gameId: string, x: TestClient, y: TestClient) {
      const first = (c: TestClient) =>
        c.next<StateMsg>((m) => m.t === "state" && m.gameId === gameId);
      x.send({ t: "watch", gameId });
      y.send({ t: "watch", gameId });
      return [await first(x), await first(y)] as const;
    }

    /** What the game row keeps. */
    async function stored(gameId: string) {
      const [g] = await t.db
        .select({ cosmetics: games.cosmetics })
        .from(games)
        .where(eq(games.id, gameId));
      return g!.cosmetics;
    }

    it("shows both players the host's, whichever seat the host gets", async () => {
      const { a, b, sa, sb, anne } = await anneHosts();
      for (const s of [sa, sb]) expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: sa.seat });
      expect(await stored(sa.gameId)).toEqual({ hostId: idOf(anne), ...ANNES });

      // Seats are shuffled: another game, with Anne in the other seat.
      const other = (1 - sa.seat) as Seat;
      const [sa2, sb2] = await watch(await hostAt(other, a, b, idOf(anne)), a, b);
      expect(sa2.seat).toBe(other);
      for (const s of [sa2, sb2]) expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: other });
    });

    it("never shows the other player's", async () => {
      const { sa, sb } = await anneHosts(async (_anne, bonny) => {
        await setShopOpen(t.db, true);
        await uses(bonny, BONNYS);
      });
      for (const s of [sa, sb]) {
        expect(s.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: sa.seat });
      }
    });

    it("shows the inviter's for an invite", async () => {
      const { a, b } = await connected(async (anne, bonny) => {
        await anneUsesHers(anne);
        await uses(bonny, BONNYS);
      });
      // Bonny sends the invite; Anne (who signed up first) joins it.
      b.send({ t: "createInvite", menu: CLASSIC });
      const { code } = await b.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      a.send({ t: "joinInvite", code });
      const { gameId } = await a.next<Matched>((m) => m.t === "matched");
      const [sa, sb] = await watch(gameId, a, b);
      for (const s of [sa, sb]) expect(s.cosmetics).toEqual({ ...BONNYS, hostSeat: sb.seat });
    });

    it("shows the challenger's for a challenge", async () => {
      const { a, b, anne, bonny } = await connected(async (anne, bonny) => {
        await anneUsesHers(anne);
        await uses(bonny, BONNYS);
        // Only friends can challenge.
        await post("/api/friends/requests", anne.cookie, { username: "Bonny" });
        await post(`/api/friends/requests/${idOf(anne)}/accept`, bonny.cookie);
      });
      a.send({ t: "challenge", friendId: idOf(bonny), menu: CLASSIC });
      const c = await b.next<Extract<ServerMessage, { t: "challenge" }>>(
        (m) => m.t === "challenge",
      );
      b.send({ t: "acceptChallenge", challengeId: c.challengeId });
      const { gameId } = await b.next<Matched>((m) => m.t === "matched");
      const [sa, sb] = await watch(gameId, a, b);
      for (const s of [sa, sb]) expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: sa.seat });
      expect(await stored(gameId)).toEqual({ hostId: idOf(anne), ...ANNES });
    });

    it("keeps what the host used at the start when they switch mid-game", async () => {
      const { gameId, a, b, sa, anne } = await anneHosts();
      await use(anne, "board.serpent-reef");
      const switched = await use(anne, "deck.cribbage-logo");
      expect(switched.json()).toEqual({ equipped: DEFAULT_COSMETICS });

      const mark = b.messages.length;
      expect(await move(a, gameId, nextMove(sa.step.view, false)!)).toMatchObject({ t: "state" });
      const next = [a.latestState()!, await b.after<StateMsg>(mark, (m) => m.t === "state")];
      for (const s of next) {
        expect(s.step.events.length).toBeGreaterThan(0);
        expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: sa.seat });
      }
    });

    it("keeps them after a server restart, not what the host uses now", async () => {
      const { gameId, sa, sb, anne, bonny } = await anneHosts();
      // Anne goes back to the default board; the game keeps the copy made when it started.
      await use(anne, "board.serpent-reef");
      const app2 = await t.restart();
      try {
        for (const [who, seat] of [
          [anne, sa.seat],
          [bonny, sb.seat],
        ] as const) {
          const c = await connect(app2, who.cookie);
          c.send({ t: "watch", gameId });
          const s = await c.next<StateMsg>((m) => m.t === "state");
          expect(s.seat).toBe(seat);
          expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: sa.seat });
        }
      } finally {
        await app2.close();
      }
    });

    it("draws the defaults for a game started before the shop", async () => {
      const { gameId, anne, bonny } = await anneHosts();
      await t.db.update(games).set({ cosmetics: null }).where(eq(games.id, gameId));
      const app2 = await t.restart();
      try {
        for (const who of [anne, bonny]) {
          const c = await connect(app2, who.cookie);
          c.send({ t: "watch", gameId });
          const s = await c.next<StateMsg>((m) => m.t === "state");
          // With no record of the host, the game row's first player (seat 0) is taken as host.
          expect(s.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: 0 });
        }
      } finally {
        await app2.close();
      }
    });

    it("keeps the host for a rematch the other player asks for first, with what they use now", async () => {
      const { gameId: first, a, b, sa, anne } = await anneHosts();
      // Anne hosts from seat 1, so a rematch that put seat 0 first would make Bonny the host.
      const gameId = sa.seat === 1 ? first : await hostAt(1, a, b, idOf(anne));
      if (gameId !== first) await watch(gameId, a, b);
      await playOut(gameId, [a, b]);
      // Between the games, Anne starts using another board.
      await giveAndUse(t.db, idOf(anne), BONNYS.board);

      b.send({ t: "rematch", gameId });
      await b.next((m) => m.t === "rematchWaiting");
      await a.next((m) => m.t === "rematchOffer");
      a.send({ t: "rematch", gameId });
      const { gameId: next } = await a.next<Matched>((m) => m.t === "matched");
      await b.next((m) => m.t === "matched");
      const [ra, rb] = await watch(next, a, b);
      const now = { board: BONNYS.board, deck: ANNES.deck };
      for (const s of [ra, rb]) expect(s.cosmetics).toEqual({ ...now, hostSeat: ra.seat });
      expect(await stored(next)).toEqual({ hostId: idOf(anne), ...now });
    }, 60_000);

    it("adds only the board, the backs and the host's seat to the state message", async () => {
      // Build 4 of the iPhone app reads every other field just as it was.
      const { sa, sb, anne, bonny } = await anneHosts();
      for (const s of [sa, sb]) {
        expect(s).toEqual({
          t: "state",
          gameId: sa.gameId,
          seat: s.seat,
          names: [expect.any(String), expect.any(String)],
          avatars: [null, null],
          cosmetics: { ...ANNES, hostSeat: sa.seat },
          ranked: false,
          step: {
            events: [],
            view: expect.objectContaining({ phase: "cutForDeal", seat: s.seat }),
          },
          deadline: expect.any(Number),
          online: [expect.any(Boolean), expect.any(Boolean)],
          returnBy: [null, null],
          nextRoundReady: [],
          sceneWaits: [],
        });
        // The host is a seat, never an account id.
        for (const id of [idOf(anne), idOf(bonny)]) expect(JSON.stringify(s)).not.toContain(id);
      }
      expect(new Set([sa.seat, sb.seat])).toEqual(new Set([0, 1]));
    });

    it("draws the defaults for an admin host while the shop is closed, and theirs once it opens", async () => {
      const {
        gameId,
        a,
        b,
        sa,
        sb,
        anne: captain,
        bonny,
      } = await anneHosts((captain) => uses(captain, ANNES), ["Captain", "Bonny"]);
      expect(captain.res.json().user.isAdmin).toBe(true);
      expect(bonny.res.json().user.isAdmin).toBe(false);
      // A preview only Captain sees: it isn't kept with the game either. Only Captain is told
      // the defaults stand in for his.
      expect(sa.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: sa.seat, withheld: true });
      expect(sb.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: sa.seat });
      expect(await stored(gameId)).toEqual({
        hostId: idOf(captain),
        ...DEFAULT_COSMETICS,
        withheld: true,
      });

      await setShopOpen(t.db, true);
      const [oa, ob] = await watch(await queueAgain(a, b), a, b);
      for (const s of [oa, ob]) expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: oa.seat });

      // Bonny buys and uses Ghost Ship and the Ghost backs while it's open; then it closes again.
      await credit(t.db, idOf(bonny), 2500, "admin", randomUUID());
      for (const [itemId, price] of [
        [BONNYS.board, 1500],
        [BONNYS.deck, 1000],
      ] as const) {
        expect((await post("/api/shop/buy", bonny.cookie, { itemId, price })).statusCode).toBe(200);
        expect((await use(bonny, itemId)).statusCode).toBe(200);
      }
      await setShopOpen(t.db, false);
      // Bonny waits first this time, so she hosts.
      const [cb, ca] = await watch(await queueAgain(b, a), b, a);
      for (const s of [ca, cb]) expect(s.cosmetics).toEqual({ ...BONNYS, hostSeat: cb.seat });
      await expectLedgerMatches(t.db);
      await expectPurchasesMatch(t.db, idOf(bonny));
    });

    it("keeps what an admin bought in the preview to them while the shop is closed, after they stop being an admin", async () => {
      const admin = (who: SignedUp, by: SignedUp, isAdmin: boolean) =>
        post(`/api/admin/users/${idOf(who)}/admin`, by.cookie, { isAdmin });
      const buy = async (who: SignedUp, itemId: string, price: number) => {
        expect((await post("/api/shop/buy", who.cookie, { itemId, price })).statusCode).toBe(200);
        expect((await use(who, itemId)).statusCode).toBe(200);
      };
      const { a, b, anne, bonny } = await connected(async (anne, bonny) => {
        // Anne (the first account) makes Bonny an admin, so Bonny can look round the closed
        // shop; Bonny buys and uses two items there; then Anne takes the role back.
        expect((await admin(bonny, anne, true)).statusCode).toBe(200);
        await credit(t.db, idOf(bonny), 3500, "admin", randomUUID());
        await buy(bonny, ANNES.board, 1500);
        await buy(bonny, ANNES.deck, 1000);
        expect((await admin(bonny, anne, false)).statusCode).toBe(200);
      });
      expect(anne.res.json().user.isAdmin).toBe(true);
      // Bonny waits first, so she hosts: what she bought in the preview still shows only to her.
      const closed = await queueAgain(b, a);
      const [cb, ca] = await watch(closed, b, a);
      expect(cb.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: cb.seat, withheld: true });
      expect(ca.cosmetics).toEqual({ ...DEFAULT_COSMETICS, hostSeat: cb.seat });
      expect(await stored(closed)).toEqual({
        hostId: idOf(bonny),
        ...DEFAULT_COSMETICS,
        withheld: true,
      });

      // Once the shop opens, everyone sees them.
      await setShopOpen(t.db, true);
      const [ob, oa] = await watch(await queueAgain(b, a), b, a);
      for (const s of [oa, ob]) expect(s.cosmetics).toEqual({ ...ANNES, hostSeat: ob.seat });

      // She buys the Ghost backs while it's open and uses them; then it closes again. The backs
      // show; the board, bought in the preview, doesn't.
      await buy(bonny, "deck.ghost", 1000);
      await setShopOpen(t.db, false);
      const [pb, pa] = await watch(await queueAgain(b, a), b, a);
      const mixed = { board: DEFAULT_COSMETICS.board, deck: "deck.ghost" };
      expect(pb.cosmetics).toEqual({ ...mixed, hostSeat: pb.seat, withheld: true });
      expect(pa.cosmetics).toEqual({ ...mixed, hostSeat: pb.seat });
      await expectLedgerMatches(t.db);
      await expectPurchasesMatch(t.db, idOf(bonny));
    });
  });
});
