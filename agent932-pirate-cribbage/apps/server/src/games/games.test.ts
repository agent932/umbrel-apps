import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { type PlayerView, cardLabel, chooseDiscard, choosePlay } from "@pirate/engine";
import { games, matches, users, walletLedger } from "../db/schema.js";
import { expectLedgerMatches } from "../test/ledger.js";
import { signUp, testApp } from "../test/testApp.js";
import type { ClientAction } from "./actions.js";
import type { GameResponse } from "./aiGames.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

/** What a sensible player sends next, from what the server shows them. */
function nextMove(view: PlayerView): ClientAction | null {
  const mine = view.toAct.includes(view.seat);
  switch (view.phase) {
    case "cutForDeal": {
      // Cut any face-down card the other player hasn't taken.
      const cfd = view.cutForDeal;
      if (!mine || !cfd?.deckSize) return null;
      const index = Array.from({ length: cfd.deckSize }, (_, i) => i).find(
        (i) => !cfd.taken.includes(i),
      )!;
      return { type: "pickCut", index };
    }
    case "discard":
      return view.hand.length === 6
        ? { type: "discard", cards: chooseDiscard(view.hand, view.dealer === view.seat) }
        : null;
    case "cut":
      return mine ? { type: "cut" } : null;
    case "preplay":
      return view.needsReady ? { type: "ready" } : null;
    case "pegging":
      // Not our turn: the server paused so we could Belay That!, so tell it to carry on.
      return mine ? { type: "play", card: choosePlay(view) } : { type: "continue" };
    case "roundEnd":
      return { type: "nextRound" };
    default:
      return null;
  }
}

async function post(url: string, cookie: string, payload?: object) {
  return t.app.inject({ method: "POST", url, headers: { cookie }, payload: payload ?? {} });
}

/** Cut for deal (any free card) until the hands are dealt; returns the latest response. */
async function cutIn(cookie: string, res: GameResponse): Promise<GameResponse> {
  for (let i = 0; i < 10; i++) {
    const view = res.steps.at(-1)!.view;
    if (view.phase !== "cutForDeal") return res;
    const move = nextMove(view)!;
    res = (await post(`/api/games/${res.gameId}/actions`, cookie, move)).json();
  }
  throw new Error("Cut for deal never finished");
}

async function startGame(cookie: string, variant: "classic" | "pirate", level = "medium") {
  return (await post("/api/games", cookie, { level, variant })).json() as GameResponse;
}

/** Play a started game to the end. `final` is the response that finished it. */
async function playFrom(cookie: string, start: GameResponse) {
  const gameId = start.gameId;
  let res = start;
  let lastMove: ClientAction | null = null;
  const seen: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const view = res.steps.at(-1)!.view;
    seen.push(JSON.stringify(res));
    if (view.phase === "gameOver") return { gameId, view, seen, final: res, lastMove: lastMove! };
    const move = nextMove(view);
    if (!move) throw new Error(`Stuck in ${view.phase}`);
    const r = await post(`/api/games/${gameId}/actions`, cookie, move);
    expect(r.statusCode, r.body).toBe(200);
    res = r.json();
    lastMove = move;
  }
  throw new Error("Game did not finish");
}

async function playWholeGame(cookie: string, variant: "classic" | "pirate", level = "medium") {
  return playFrom(cookie, await startGame(cookie, variant, level));
}

/** Move a game's start back 10 minutes, so it's long enough to pay doubloons. */
const backdate = (gameId: string) =>
  t.db
    .update(games)
    .set({ createdAt: sql`now() - interval '10 minutes'` })
    .where(eq(games.id, gameId));

const ledgerCount = async () => (await t.db.select().from(walletLedger)).length;
const doubloons = async (cookie: string) =>
  (await t.app.inject({ url: "/api/auth/me", headers: { cookie } })).json().user.doubloons;

describe("games vs the computer", () => {
  it("needs an account", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/games",
      payload: { level: "easy", variant: "classic" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("deals straight away and shows only your own cards", async () => {
    const { cookie } = await signUp(t.app);
    const res = await post("/api/games", cookie, { level: "medium", variant: "classic" });
    expect(res.statusCode).toBe(201);
    const view = (res.json() as GameResponse).steps.at(-1)!.view;
    // Games open with the cut for deal; the computer has already cut.
    expect(view.phase).toBe("cutForDeal");
    expect(view.toAct).toEqual([0]);
    expect(view.cutForDeal?.taken).toHaveLength(1);
    expect(view).not.toHaveProperty("deck");
    expect(view).not.toHaveProperty("hands");
  });

  it("plays a classic game to the end and records it for stats", async () => {
    const { cookie } = await signUp(t.app);
    const { view } = await playWholeGame(cookie, "classic");
    expect(view.winner).not.toBeNull();

    const stats = (await t.app.inject({ url: "/api/stats", headers: { cookie } })).json();
    const medium = stats.buckets.find((b: { key: string }) => b.key === "ai-medium").stats;
    expect(medium.matchesPlayed).toBe(1);
    expect(medium.wins + medium.losses).toBe(1);
    expect(medium.roundsPlayed).toBeGreaterThan(3);
    expect(medium.dealtTotal).toBeGreaterThanOrEqual(medium.roundsPlayed * 6);
    // Every recorded round has hand analyzer scores for both players.
    expect(medium.analyzer.avg).toBeGreaterThan(50);
    expect(medium.analyzer.avg).toBeLessThanOrEqual(100);
    expect(medium.analyzer.avgOpp).toBeGreaterThan(50);
    const easy = stats.buckets.find((b: { key: string }) => b.key === "ai-easy").stats;
    expect(easy.matchesPlayed).toBe(0);

    // Filtering by variant.
    const pirate = (
      await t.app.inject({ url: "/api/stats?variant=pirate", headers: { cookie } })
    ).json();
    expect(pirate.buckets.find((b: { key: string }) => b.key === "all").stats.matchesPlayed).toBe(
      0,
    );
  }, 60_000);

  it("plays a pirate game, pausing for Belay That! after each of your plays", async () => {
    const { cookie } = await signUp(t.app);
    const { seen } = await playWholeGame(cookie, "pirate", "easy");
    // At least one response stopped at the computer's turn so we could take our card back.
    expect(seen.some((s) => /"phase":"pegging"/.test(s) && /"toAct":\[1\]/.test(s))).toBe(true);
  }, 60_000);

  it("never reveals the computer's hand", async () => {
    const { cookie } = await signUp(t.app);
    const res = await cutIn(
      cookie,
      (
        await post("/api/games", cookie, { level: "medium", variant: "pirate" })
      ).json() as GameResponse,
    );
    const view = res.steps.at(-1)!.view;
    expect(view.opponentCardCount).toBeGreaterThanOrEqual(4);
    // Spyglass is the only way to see it.
    const spy = (
      await post(`/api/games/${res.gameId}/actions`, cookie, { type: "spyglass" })
    ).json() as GameResponse;
    const spied = spy.steps.at(-1)!.view.spied!;
    expect(spied.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(res)).not.toContain(JSON.stringify(spied.map(cardLabel)));
  });

  it("rejects illegal moves without changing the game", async () => {
    const { cookie } = await signUp(t.app);
    const res = (
      await post("/api/games", cookie, { level: "easy", variant: "classic" })
    ).json() as GameResponse;
    const bad = await post(`/api/games/${res.gameId}/actions`, cookie, {
      type: "play",
      card: { rank: 5, suit: "H" },
    });
    expect(bad.statusCode).toBe(422);
    const garbage = await post(`/api/games/${res.gameId}/actions`, cookie, {
      type: "deal",
      deck: [],
    });
    expect(garbage.statusCode).toBe(400);
    const active = (await t.app.inject({ url: "/api/games/active", headers: { cookie } })).json();
    expect(active.game.steps[0].view.hand).toEqual(res.steps.at(-1)!.view.hand);
  });

  it("keeps players out of each other's games", async () => {
    const a = await signUp(t.app, "Anne");
    const b = await signUp(t.app, "Bonny");
    const game = await cutIn(
      a.cookie,
      (
        await post("/api/games", a.cookie, { level: "easy", variant: "classic" })
      ).json() as GameResponse,
    );
    const hand = game.steps.at(-1)!.view.hand;
    expect(hand).toHaveLength(6);
    const res = await post(`/api/games/${game.gameId}/actions`, b.cookie, {
      type: "discard",
      cards: hand.slice(0, 2),
    });
    expect(res.statusCode).toBe(404);
  });

  it("offers a hard computer opponent", async () => {
    const { cookie } = await signUp(t.app);
    const res = await post("/api/games", cookie, { level: "hard", variant: "classic" });
    expect(res.statusCode).toBe(201);
    expect(res.json().level).toBe("hard");
  });

  it("only allows the menu's rules", async () => {
    const { cookie } = await signUp(t.app);
    const res = await post("/api/games", cookie, {
      level: "medium",
      variant: "pirate",
      powerCost: 99,
    });
    expect(res.statusCode).toBe(400);
  });

  it("resumes the active game, and a new game replaces it", async () => {
    const { cookie } = await signUp(t.app);
    const first = (
      await post("/api/games", cookie, { level: "easy", variant: "classic" })
    ).json() as GameResponse;
    let active = (await t.app.inject({ url: "/api/games/active", headers: { cookie } })).json();
    expect(active.game.gameId).toBe(first.gameId);
    const second = (
      await post("/api/games", cookie, { level: "medium", variant: "pirate" })
    ).json() as GameResponse;
    active = (await t.app.inject({ url: "/api/games/active", headers: { cookie } })).json();
    expect(active.game.gameId).toBe(second.gameId);
    const old = await post(`/api/games/${first.gameId}/actions`, cookie, { type: "nextRound" });
    expect(old.statusCode).toBe(404);
    await post(`/api/games/${second.gameId}/abandon`, cookie);
    active = (await t.app.inject({ url: "/api/games/active", headers: { cookie } })).json();
    expect(active.game).toBeNull();
  });
});

describe("doubloons vs the computer", () => {
  it("pays a win on the response that finishes the game, once", async () => {
    const { cookie } = await signUp(t.app);
    const start = await startGame(cookie, "classic");
    await backdate(start.gameId);
    const { view, seen, final, lastMove } = await playFrom(cookie, start);
    // Only the finishing response carries the reward.
    expect(seen.slice(0, -1).some((s) => s.includes('"reward"'))).toBe(false);
    const reward = final.reward!;
    expect(reward).toBeDefined();
    expect(reward.note).toBeNull();
    if (view.winner === 0) {
      expect(reward.lines).toContainEqual({ reason: "botWin", delta: 35 });
      expect(reward.lines).toContainEqual({ reason: "firstWinOfDay", delta: 50 });
    } else {
      expect(reward.lines.filter((l) => l.reason !== "achievement")).toEqual([]);
    }
    expect(await doubloons(cookie)).toBe(reward.balance);

    // Sending the last move again finds the game finished, and pays nothing more.
    const rows = await ledgerCount();
    const again = await post(`/api/games/${start.gameId}/actions`, cookie, lastMove);
    expect(again.statusCode).toBe(404);
    expect(await ledgerCount()).toBe(rows);
    await expectLedgerMatches(t.db);
  }, 60_000);

  it("pays nothing for a win in under 3 minutes", async () => {
    const { cookie } = await signUp(t.app);
    const { view, final } = await playWholeGame(cookie, "classic", "easy");
    const reward = final.reward!;
    expect(reward.note).toBe(view.winner === 0 ? "short" : null);
    expect(reward.lines.some((l) => l.reason === "botWin")).toBe(false);
    expect(await doubloons(cookie)).toBe(reward.balance);
    await expectLedgerMatches(t.db);
  }, 60_000);

  it("pays nothing for games abandoned or replaced", async () => {
    const { cookie } = await signUp(t.app);
    const first = await startGame(cookie, "classic");
    await backdate(first.gameId);
    await startGame(cookie, "pirate");
    const second = (await t.app.inject({ url: "/api/games/active", headers: { cookie } })).json();
    await post(`/api/games/${second.game.gameId}/abandon`, cookie);
    expect(await ledgerCount()).toBe(0);
    expect(await doubloons(cookie)).toBe(0);
  });

  it("keeps nothing from a game whose recording fails", async () => {
    const { cookie } = await signUp(t.app);
    await t.db.execute(sql`
      create function boom() returns trigger language plpgsql as $$
      begin raise exception 'boom'; end $$`);
    await t.db.execute(
      sql`create trigger boom before insert on rounds for each row execute function boom()`,
    );
    let res = await startGame(cookie, "classic");
    const gameId = res.gameId;
    await backdate(gameId);
    let failed: Awaited<ReturnType<typeof post>> | null = null;
    for (let i = 0; i < 1000 && !failed; i++) {
      const r = await post(
        `/api/games/${gameId}/actions`,
        cookie,
        nextMove(res.steps.at(-1)!.view)!,
      );
      if (r.statusCode === 200) res = r.json();
      else failed = r;
    }
    expect(failed?.statusCode).toBe(500);
    expect(await ledgerCount()).toBe(0);
    expect(await t.db.select().from(matches)).toEqual([]);
    const [me] = await t.db.select({ doubloons: users.doubloons }).from(users);
    expect(me!.doubloons).toBe(0);
    const [game] = await t.db.select().from(games).where(eq(games.id, gameId));
    expect(game!.finishedAt).toBeNull();
  }, 60_000);
});

describe("health", () => {
  it("reports ok", async () => {
    const res = await t.app.inject({ url: "/api/health" });
    expect(res.json()).toMatchObject({ status: "ok", db: "up", version: "dev" });
  });
});
