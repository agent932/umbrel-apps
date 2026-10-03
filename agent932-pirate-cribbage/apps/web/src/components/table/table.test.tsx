import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { type GameEvent, parseCard } from "@pirate/engine";
import { HandSlot } from "./HandSlot.js";
import { ScorePops } from "./ScorePops.js";

describe("ScorePops", () => {
  afterEach(() => vi.useRealTimers());

  it("shows what a play scored, then clears it", () => {
    vi.useFakeTimers();
    const events: GameEvent[] = [
      {
        type: "played",
        seat: 0,
        card: parseCard("5H"),
        count: 15,
        score: { fifteen: 2, thirtyOne: 0, pairs: 2, run: 0, total: 4 },
      },
      { type: "kraken", seat: 1, points: -4, hole: 26 },
    ];
    const { container } = render(<ScorePops events={events} me={0} />);
    expect(container).toHaveTextContent("+4");
    expect(container).toHaveTextContent("fifteen + a pair");
    expect(container.querySelector(".t-pop.mine")).not.toBeNull();
    expect(container).toHaveTextContent("−4");
    expect(container.querySelector(".t-pop.bad")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1700));
    expect(container.querySelectorAll(".t-pop")).toHaveLength(0);
  });

  it("stays quiet for plays that score nothing", () => {
    const events: GameEvent[] = [
      {
        type: "played",
        seat: 1,
        card: parseCard("9H"),
        count: 9,
        score: { fifteen: 0, thirtyOne: 0, pairs: 0, run: 0, total: 0 },
      },
    ];
    const { container } = render(<ScorePops events={events} me={0} />);
    expect(container.querySelectorAll(".t-pop")).toHaveLength(0);
  });
});

describe("HandSlot", () => {
  const pointer = (type: string, y: number) =>
    new PointerEvent(type, { bubbles: true, button: 0, clientY: y, pointerId: 1 });

  it("plays a card flicked upward, once", () => {
    const onFlick = vi.fn();
    const onClick = vi.fn();
    render(
      <HandSlot i={0} n={1} selected={false} playable tooHigh={false} onFlick={onFlick}>
        <button type="button" onClick={onClick}>
          5 of hearts
        </button>
      </HandSlot>,
    );
    const card = screen.getByRole("button", { name: "5 of hearts" });
    act(() => {
      card.dispatchEvent(pointer("pointerdown", 300));
      window.dispatchEvent(pointer("pointermove", 270));
      window.dispatchEvent(pointer("pointerup", 240));
    });
    // The browser then sends a click; it mustn't play the card a second time.
    fireEvent.click(card);
    expect(onFlick).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("ignores a small wobble, and shakes a card that would go past 31", () => {
    const onFlick = vi.fn();
    const { container, rerender } = render(
      <HandSlot i={0} n={1} selected={false} playable tooHigh={false} onFlick={onFlick}>
        <span>card</span>
      </HandSlot>,
    );
    const slot = container.querySelector(".t-slot")!;
    act(() => {
      slot.dispatchEvent(pointer("pointerdown", 300));
      window.dispatchEvent(pointer("pointerup", 290));
    });
    expect(onFlick).not.toHaveBeenCalled();

    rerender(
      <HandSlot i={0} n={1} selected={false} playable={false} tooHigh>
        <span>card</span>
      </HandSlot>,
    );
    act(() => {
      slot.dispatchEvent(pointer("pointerdown", 300));
    });
    expect(container.querySelector(".t-shake")).not.toBeNull();
  });
});
