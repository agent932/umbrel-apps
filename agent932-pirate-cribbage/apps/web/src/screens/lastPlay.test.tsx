import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { type GameEvent, parseCard } from "@pirate/engine";
import { useLastPlay } from "./GameScreen.js";

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
});
