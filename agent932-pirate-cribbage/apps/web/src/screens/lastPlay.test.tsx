import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { type GameEvent, parseCard } from "@pirate/engine";
import { useLastPlay, useResetHold } from "./GameScreen.js";

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
