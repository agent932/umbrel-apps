import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  CLASSIC_RULES,
  KRAKEN_HOLES,
  PIRATE_RULES,
  TREASURE_HOLES,
  type GameEvent,
  parseCard,
} from "@pirate/engine";
import { getBoardSkin, holePoint } from "../../brand/boardSkins.js";
import { HandSlot } from "./HandSlot.js";
import { PaintedBoard } from "./PaintedBoard.js";
import { pileTilt } from "./PlayArea.js";
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
    const { container } = render(
      <ScorePops events={events} me={0} names={["You", "Bosun Barnaby"]} />,
    );
    expect(container).toHaveTextContent("You+4");
    expect(container).toHaveTextContent("Bosun Barnaby−4");
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
    const { container } = render(<ScorePops events={events} me={0} names={["You", "Anne"]} />);
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

describe("PaintedBoard", () => {
  const { upright: layout } = getBoardSkin();
  const pegAt = (container: HTMLElement, peg: string) =>
    (container.querySelector(`[data-peg="${peg}"]`) as SVGGElement).style.transform;
  const translate = ([x, y]: [number, number]) => `translate(${x}px, ${y}px)`;

  it.each([0, 1, 5, 6, 60, 61, 120, 121])("puts both pegs at %i in the hole map's holes", (n) => {
    const { container } = render(
      <PaintedBoard
        scores={[n, n]}
        backPegs={[0, 0]}
        rules={CLASSIC_RULES}
        names={["You", "Anne"]}
        me={0}
        upright
        instant
      />,
    );
    // You run in the right lane, the opponent in the left.
    expect(pegAt(container, "me-front")).toBe(translate(holePoint(layout, 1, n)));
    expect(pegAt(container, "opponent-front")).toBe(translate(holePoint(layout, 0, n)));
    expect(pegAt(container, "me-back")).toBe(translate(holePoint(layout, 1, 0)));
  });

  it("keeps you in the right lane from seat 1, and lays the board on its side in portrait", () => {
    const { container } = render(
      <PaintedBoard
        scores={[10, 61]}
        backPegs={[4, 50]}
        rules={CLASSIC_RULES}
        names={["Anne", "You"]}
        me={1}
        upright={false}
        instant
      />,
    );
    const side = ([u, v]: [number, number]): [number, number] => [v, layout.size[0] - u];
    expect(pegAt(container, "me-front")).toBe(translate(side(holePoint(layout, 1, 61))));
    expect(pegAt(container, "me-back")).toBe(translate(side(holePoint(layout, 1, 50))));
    expect(pegAt(container, "opponent-front")).toBe(translate(side(holePoint(layout, 0, 10))));
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe(
      `0 0 ${layout.size[1]} ${layout.size[0]}`,
    );
  });

  it("stands the default board's pegs up as art, tip in the hole, and draws the game hole once", () => {
    const skin = getBoardSkin();
    const { container } = render(
      <PaintedBoard
        scores={[121, 40]}
        backPegs={[100, 30]}
        rules={CLASSIC_RULES}
        names={["You", "Anne"]}
        me={0}
        upright
        instant
      />,
    );
    const art = (peg: string) =>
      container.querySelector(`[data-peg="${peg}"] image`)!.getAttribute("href");
    expect(art("me-front")).toBe(skin.pegUrls!.me);
    expect(art("opponent-back")).toBe(skin.pegUrls!.opponent);
    // The sprite stands above its hole: it ends just below the hole's centre.
    const img = container.querySelector('[data-peg="me-front"] image')!;
    expect(Number(img.getAttribute("y")) + Number(img.getAttribute("height"))).toBeGreaterThan(0);
    expect(Number(img.getAttribute("y"))).toBeLessThan(0);
    // Both lanes share the one game hole, so there is a single brass ring.
    expect(container.querySelectorAll('circle[stroke="#f2b84b"]')).toHaveLength(1);
  });

  it("still draws round pegs on the Classic Serpent board", () => {
    const { container } = render(
      <PaintedBoard
        scores={[3, 4]}
        backPegs={[0, 0]}
        rules={CLASSIC_RULES}
        names={["You", "Anne"]}
        me={0}
        upright
        instant
        skinId="classic-serpent"
      />,
    );
    expect(container.querySelector("[data-peg] image")).toBeNull();
    expect(container.querySelectorAll('circle[stroke="#f2b84b"]')).toHaveLength(2);
  });

  it("marks the treasure and Kraken holes on both lanes under pirate rules", () => {
    const { container } = render(
      <PaintedBoard
        scores={[0, 0]}
        backPegs={[0, 0]}
        rules={PIRATE_RULES}
        names={["You", "Anne"]}
        me={0}
        upright
        instant
      />,
    );
    const xs = [...container.querySelectorAll("text")].map((t) => Number(t.getAttribute("x")));
    const want = [0, 1].flatMap((lane) =>
      TREASURE_HOLES.map((n) => holePoint(layout, lane as 0 | 1, n)[0]),
    );
    expect(xs).toEqual(want);
    const rings = [...container.querySelectorAll('circle[stroke="#3fb6c9"]')].map((c) => [
      Number(c.getAttribute("cx")),
      Number(c.getAttribute("cy")),
    ]);
    expect(rings).toEqual(
      [0, 1].flatMap((lane) => KRAKEN_HOLES.map((n) => holePoint(layout, lane as 0 | 1, n))),
    );
  });
});

describe("pileTilt", () => {
  it("leans each card a little, the same way every time", () => {
    const tilts = ["AS", "5H", "10D", "KC", "7S"].map((c) => pileTilt(parseCard(c)));
    for (const t of tilts) expect(Math.abs(t)).toBeLessThanOrEqual(5);
    expect(new Set(tilts).size).toBeGreaterThan(1);
    expect(pileTilt(parseCard("5H"))).toBe(tilts[1]);
  });
});
