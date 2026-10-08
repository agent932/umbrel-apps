import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { CLASSIC_RULES, type GameEvent, botAction, parseCard } from "@pirate/engine";
import {
  BOT,
  type LocalGame,
  YOU,
  houseAction,
  names,
  newLocalGame,
  step,
} from "../game/localGame.js";
import type { GameController } from "../game/types.js";
import { GameScreen, useLastPlay, useResetHold } from "./GameScreen.js";

describe("the last cards of a round", () => {
  afterEach(() => vi.useRealTimers());

  it("stay on the table, with the final card and count, before the hands are counted", () => {
    vi.useFakeTimers();
    const first = [{ card: parseCard("7H"), seat: 0 as const }];
    const { result, rerender } = renderHook(
      ({ pile, count, pegging, events }) => useLastPlay(pile, count, pegging, events, false),
      { initialProps: { pile: first, count: 7, pegging: true, events: [] as GameEvent[] } },
    );
    expect(result.current).toBeNull();

    // The bot plays the last card; the round moves straight on to the show.
    const ending: GameEvent[] = [
      {
        type: "played",
        seat: 1,
        card: parseCard("8D"),
        count: 15,
        score: { fifteen: 2, thirtyOne: 0, pairs: 0, run: 0, total: 2 },
      },
      { type: "lastCard", seat: 1, points: 1 },
    ];
    rerender({ pile: [], count: 0, pegging: false, events: ending });
    expect(result.current?.count).toBe(15);
    expect(result.current?.pile.map((p) => p.card)).toEqual([parseCard("7H"), parseCard("8D")]);

    act(() => vi.advanceTimersByTime(3600));
    expect(result.current).toBeNull();
  });

  it("are held from the very first frame after the last card, never a frame late", () => {
    const first = [{ card: parseCard("7H"), seat: 0 as const }];
    const frames: (ReturnType<typeof useLastPlay> | undefined)[] = [];
    const { rerender } = renderHook(
      ({ pile, count, pegging, events }) => {
        const held = useLastPlay(pile, count, pegging, events, false);
        frames.push(held);
        return held;
      },
      { initialProps: { pile: first, count: 7, pegging: true, events: [] as GameEvent[] } },
    );
    frames.length = 0;
    rerender({ pile: [], count: 0, pegging: false, events: [played(1, "8D", 15)] });
    // A frame without the hold would show the counting and drop the pile, then bring both back.
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.map((f) => f?.count)).toEqual(frames.map(() => 15));
  });

  it("hold their full time when more news arrives meanwhile, then clear", () => {
    vi.useFakeTimers();
    const first = [{ card: parseCard("7H"), seat: 0 as const }];
    const { result, rerender } = renderHook(
      ({ pegging, events }) => useLastPlay(first, 7, pegging, events, false, 3500),
      { initialProps: { pegging: true, events: [] as GameEvent[] } },
    );
    const ending: GameEvent[] = [
      {
        type: "played",
        seat: 1,
        card: parseCard("8D"),
        count: 15,
        score: { fifteen: 2, thirtyOne: 0, pairs: 0, run: 0, total: 2 },
      },
    ];
    rerender({ pegging: false, events: ending });
    act(() => vi.advanceTimersByTime(1000));
    // An online resync (no new plays) arrives while the cards are held.
    rerender({ pegging: false, events: [] });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current?.count).toBe(15);
    // ...and they still clear on time, rather than staying stuck over the show.
    act(() => vi.advanceTimersByTime(600));
    expect(result.current).toBeNull();
  });

  it("follow the hold time they're given", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ pegging, events }) => useLastPlay([], 0, pegging, events, false, 6000),
      { initialProps: { pegging: true, events: [] as GameEvent[] } },
    );
    rerender({
      pegging: false,
      events: [
        {
          type: "played",
          seat: 0,
          card: parseCard("KD"),
          count: 10,
          score: { fifteen: 0, thirtyOne: 0, pairs: 0, run: 0, total: 0 },
        },
      ],
    });
    act(() => vi.advanceTimersByTime(5900));
    expect(result.current?.count).toBe(10);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBeNull();
  });
});

const played = (seat: 0 | 1, card: string, count: number): GameEvent => ({
  type: "played",
  seat,
  card: parseCard(card),
  count,
  score: {
    fifteen: 0,
    thirtyOne: count === 31 ? 2 : 0,
    pairs: 0,
    run: 0,
    total: count === 31 ? 2 : 0,
  },
});

describe("a run of play that ends on 31 or a Go", () => {
  afterEach(() => vi.useRealTimers());
  const start = [
    { card: parseCard("JH"), seat: 0 as const },
    { card: parseCard("QD"), seat: 1 as const },
  ];

  function setup(holdMs = 2500) {
    return renderHook(
      ({ pile, count, events }) => useResetHold(pile, count, true, events, false, holdMs),
      { initialProps: { pile: start, count: 20, events: [] as GameEvent[] } },
    );
  }

  it("keeps the opponent's card that ended the run (a Go) on the table, then clears", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    expect(result.current).toBeNull();
    // The opponent plays to 21, nobody can go on, and the engine clears the pile in the same step.
    rerender({ pile: [], count: 0, events: [played(1, "AS", 21), { type: "reset" }] });
    expect(result.current?.count).toBe(21);
    expect(result.current?.pile.map((p) => p.card)).toEqual([
      parseCard("JH"),
      parseCard("QD"),
      parseCard("AS"),
    ]);
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current).toBeNull();
  });

  it("is held from the very first frame after the run ends, never a frame late", () => {
    const frames: (ReturnType<typeof useResetHold> | undefined)[] = [];
    const { rerender } = renderHook(
      ({ pile, count, events }) => {
        const held = useResetHold(pile, count, true, events, false);
        frames.push(held);
        return held;
      },
      { initialProps: { pile: start, count: 20, events: [] as GameEvent[] } },
    );
    frames.length = 0;
    rerender({ pile: [], count: 0, events: [played(1, "AS", 21), { type: "reset" }] });
    // A frame with an empty pile would make the run's cards fly in again a moment later.
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.map((f) => f?.count)).toEqual(frames.map(() => 21));
  });

  it("shows the 31 and its count", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    rerender({
      pile: [...start, { card: parseCard("AS"), seat: 1 }],
      count: 21,
      events: [played(1, "AS", 21)],
    });
    rerender({
      pile: [],
      count: 0,
      events: [played(0, "KC", 31), { type: "reset" }],
    });
    expect(result.current?.count).toBe(31);
    expect(result.current?.pile).toHaveLength(4);
  });

  it("goes as soon as the next card starts a new pile", () => {
    vi.useFakeTimers();
    const { result, rerender } = setup();
    const ended: GameEvent[] = [
      played(1, "AS", 21),
      { type: "go", seat: 1, points: 1 },
      { type: "reset" },
    ];
    rerender({ pile: [], count: 0, events: ended });
    expect(result.current).not.toBeNull();
    rerender({
      pile: [{ card: parseCard("5H"), seat: 0 }],
      count: 5,
      events: [played(0, "5H", 5)],
    });
    expect(result.current).toBeNull();
  });

  it("isn't held when a new card was led in the same step", () => {
    const { result, rerender } = setup();
    rerender({
      pile: [{ card: parseCard("5H"), seat: 1 }],
      count: 5,
      events: [played(1, "AS", 21), { type: "reset" }, played(1, "5H", 5)],
    });
    expect(result.current).toBeNull();
  });
});

/** A classic game against the crew, one card from the end of a round's play, with cards on the pile. */
function atLastCard(): { before: LocalGame; after: LocalGame } {
  for (let tries = 0; tries < 30; tries++) {
    let game = newLocalGame({ level: "easy", rules: CLASSIC_RULES });
    for (let i = 0; i < 200 && game.state.phase !== "roundEnd"; i++) {
      const { state } = game;
      const move =
        houseAction(state) ?? botAction(state, YOU, "easy") ?? botAction(state, BOT, "easy");
      const left = state.hands[0].length + state.hands[1].length;
      if (state.phase === "pegging" && left === 1 && state.pegging!.pile.length > 0)
        return { before: game, after: step(game, move!) };
      game = step(game, move!);
    }
  }
  throw new Error("No game reached its last card with cards on the pile");
}

const controller = (game: LocalGame): GameController => ({
  p: game.p,
  names: names("easy"),
  level: "easy",
  act: () => {},
  error: null,
  ranked: false,
});

describe("the last card of a round, at the table", () => {
  it("stays on the pile with the others while the counting waits: no flash of it, no cards flying in again", () => {
    const { before, after } = atLastCard();
    expect(after.state.phase).toBe("roundEnd");
    const table = (game: LocalGame) => (
      <GameScreen game={controller(game)} onExit={() => {}} onPlayAgain={() => {}} />
    );
    const { container, rerender } = render(table(before));
    const onPile = [...container.querySelectorAll(".t-pile-card")];
    expect(onPile.length).toBe(before.state.pegging!.pile.length);

    // Everything added to the page, frame by frame, as the last card goes down.
    const added: Node[] = [];
    const watch = new MutationObserver((records) =>
      records.forEach((r) => added.push(...r.addedNodes)),
    );
    watch.observe(document.body, { childList: true, subtree: true });
    rerender(table(after));
    watch.takeRecords().forEach((r) => added.push(...r.addedNodes));
    watch.disconnect();

    const dialog = (n: Node) =>
      n instanceof Element && (n.matches("[role=dialog]") || !!n.querySelector("[role=dialog]"));
    expect(added.filter(dialog)).toEqual([]);
    // The cards already down are the very same ones (not taken away and dealt in again), plus the last.
    const now = [...container.querySelectorAll(".t-pile-card")];
    expect(now).toHaveLength(onPile.length + 1);
    onPile.forEach((card, i) => expect(now[i]).toBe(card));
  });
});
