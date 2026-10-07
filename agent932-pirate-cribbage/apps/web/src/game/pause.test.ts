import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CLASSIC_RULES } from "@pirate/engine";
import { newLocalGame } from "./localGame.js";
import { useLocalGame } from "./useLocalGame.js";

describe("a game against the crew in the browser", () => {
  afterEach(() => vi.useRealTimers());

  it("holds the crew's moves while a pirate scene is up", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useLocalGame(newLocalGame({ level: "easy", rules: CLASSIC_RULES }), 100),
    );
    act(() => result.current.pause!(true));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.p.view.cutForDeal?.taken).toEqual([]);
    act(() => result.current.pause!(false));
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.p.view.cutForDeal?.taken).toHaveLength(1);
  });
});
