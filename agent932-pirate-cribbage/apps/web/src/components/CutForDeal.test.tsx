import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { type GameEvent, parseCard } from "@pirate/engine";
import { CutReveal } from "./CutForDeal.js";

describe("CutReveal", () => {
  afterEach(() => vi.useRealTimers());

  it("hides itself even when more game events arrive meanwhile", () => {
    vi.useFakeTimers();
    const cut: GameEvent[] = [
      { type: "cutForDealt", cards: [parseCard("KS"), parseCard("7C")], dealer: 1 },
    ];
    const { rerender } = render(<CutReveal events={cut} names={["You", "Bosun"]} me={0} />);
    expect(screen.getByText("Bosun deals first")).toBeInTheDocument();
    // The deal arrives while the reveal is up.
    act(() => vi.advanceTimersByTime(1000));
    rerender(<CutReveal events={[{ type: "dealt", dealer: 1 }]} names={["You", "Bosun"]} me={0} />);
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText("Bosun deals first")).toBeNull();
  });
});
