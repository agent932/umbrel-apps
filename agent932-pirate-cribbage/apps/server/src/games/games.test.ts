import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type PlayerView, cardLabel, chooseDiscard, choosePlay } from "@pirate/engine";
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

async function playWholeGame(cookie: string, variant: "classic" | "pirate", level = "medium") {
  let res = (await post("/api/games", cookie, { level, variant })).json() as GameResponse;
  const gameId = res.gameId;
  const seen: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const view = res.steps.at(-1)!.view;
    seen.push(JSON.stringify(res));
    if (view.phase === "gameOver") return { gameId, view, seen };
    const move = nextMove(view);
    if (!move) throw new Error(`Stuck in ${view.phase}`);
    const r = await post(`/api/games/${gameId}/actions`, cookie, move);
    expect(r.statusCode, r.body).toBe(200);
    res = r.json();
  }
  throw new Error("Game did not finish");
}

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
    expect(view.phase).toBe("discard");
    expect(view.hand).toHaveLength(6);
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
    const res = (
      await post("/api/games", cookie, { level: "medium", variant: "pirate" })
    ).json() as GameResponse;
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
    const game = (
      await post("/api/games", a.cookie, { level: "easy", variant: "classic" })
    ).json() as GameResponse;
    const hand = game.steps.at(-1)!.view.hand;
    const res = await post(`/api/games/${game.gameId}/actions`, b.cookie, {
      type: "discard",
      cards: hand.slice(0, 2),
    });
    expect(res.statusCode).toBe(404);
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

describe("health", () => {
  it("reports ok", async () => {
    const res = await t.app.inject({ url: "/api/health" });
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });
});
