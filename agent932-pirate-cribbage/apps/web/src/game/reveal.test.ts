import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CLASSIC_RULES, PIRATE_RULES, type RuleSet, botAction } from "@pirate/engine";
import { useShowReveal } from "../components/table/tableHooks.js";
import { SPEED_FACTOR } from "../settings.js";
import { BOT, YOU, type LocalGame, houseAction, newLocalGame, step } from "./localGame.js";
import { BOT_DELAY_MS } from "./useLocalGame.js";

/** Play bot-vs-bot until the next step that counts the show (or the game ends). */
function toShow(game: LocalGame): { before: LocalGame; after: LocalGame } | null {
  for (let i = 0; i < 2000 && game.state.phase !== "gameOver"; i++) {
    const s = game.state;
    const action =
      houseAction(s) ??
      (s.phase === "roundEnd"
        ? ({ type: "nextRound" } as const)
        : (botAction(s, YOU, "medium") ?? botAction(s, BOT, "medium"))!);
    const next = step(game, action);
    if (next.p.lastEvents.some((e) => e.type === "hand")) return { before: game, after: next };
    game = next;
  }
  return null;
}

describe("the show, one count at a time", () => {
  for (const [name, rules] of [
    ["classic", CLASSIC_RULES],
    ["pirate", PIRATE_RULES],
  ] as [string, RuleSet][]) {
    it(`stages every show so the pegs end on the real scores (${name} rules)`, () => {
      let game = newLocalGame({ level: "medium", rules });
      let shows = 0;
      for (let found = toShow(game); found; found = toShow(game)) {
        const { before, after } = found;
        const reveal = after.p.reveal!;
        // The pegging stage, then one stage per hand or crib counted.
        expect(reveal).toHaveLength(after.p.show.length + 1);
        expect(reveal.at(-1)!.scores).toEqual(after.state.scores);
        // The pegging stage only has the points pegged in play (the last card, maybe a fifteen).
        const pegged: [number, number] = [...before.state.scores];
        for (const e of reveal[0]!.events) {
          if (e.type === "played") pegged[e.seat] += e.score.total;
          if (e.type === "lastCard" || e.type === "treasure" || e.type === "kraken")
            pegged[e.seat] += e.points;
        }
        expect(reveal[0]!.events.some((e) => e.type === "hand" || e.type === "crib")).toBe(false);
        expect(reveal[0]!.scores).toEqual(pegged.map((n) => Math.min(n, rules.targetScore)));
        game = after;
        shows++;
      }
      expect(shows).toBeGreaterThan(2);
    });
  }

  it("keeps the shown scores and log behind until each count is revealed", () => {
    const found = toShow(newLocalGame({ level: "medium", rules: CLASSIC_RULES }))!;
    const p = found.after.p;
    const reveal = p.reveal!;
    const { result } = renderHook(() => useShowReveal(p, false));
    // While the last card is held and before any hand is counted: pegging points only.
    expect(result.current.scores).toEqual(reveal[0]!.scores);
    expect(result.current.backPegs).toEqual(reveal[0]!.backPegs);
    expect(result.current.events).toBe(reveal[0]!.events);
    const hidden = reveal.slice(1).reduce((t, s) => t + s.feed, 0);
    expect(result.current.feed).toEqual(p.feed.slice(hidden));

    // The non-dealer's hand is counted: only that peg moves.
    act(() => result.current.reveal(1));
    expect(result.current.scores).toEqual(reveal[1]!.scores);
    expect(result.current.events).toEqual(reveal[1]!.events);

    // Skip to the end: everything is shown, with the events of every count not yet played.
    act(() => result.current.reveal(reveal.length - 1));
    expect(result.current.scores).toEqual(found.after.state.scores);
    expect(result.current.backPegs).toEqual(p.backPegs);
    expect(result.current.events).toEqual(reveal.slice(2).flatMap((s) => s.events));
    expect(result.current.feed).toEqual(p.feed);
  });

  it("shows the real scores at once in instant mode", () => {
    const found = toShow(newLocalGame({ level: "medium", rules: CLASSIC_RULES }))!;
    const { result } = renderHook(() => useShowReveal(found.after.p, true));
    expect(result.current.scores).toEqual(found.after.state.scores);
    expect(result.current.events).toBe(found.after.p.lastEvents);
  });
});

describe("bot pacing", () => {
  it("leaves each card readable for at least 1.2 seconds at normal speed", () => {
    expect(BOT_DELAY_MS * SPEED_FACTOR.normal).toBeGreaterThanOrEqual(1200);
    expect(BOT_DELAY_MS * SPEED_FACTOR.slow).toBeGreaterThan(BOT_DELAY_MS);
  });
});
