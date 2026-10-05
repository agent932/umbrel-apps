import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { parseCard, parseCards, scoreHand } from "@pirate/engine";
import { CountingShow, HAND_PAUSE_MS, countingSteps } from "./Counting.js";

const score = (hand: string, cut: string, crib = false) =>
  scoreHand(parseCards(hand), parseCard(cut), crib);

describe("countingSteps", () => {
  it("counts the way a player says it out loud, in order", () => {
    // 7-8-8-9 with a king cut: two fifteens, a pair, a double run of three.
    const steps = countingSteps(score("7H 8D 8C 9S", "KS"));
    expect(steps.map((s) => s.phrase)).toEqual([
      "fifteen two",
      "fifteen four",
      "a pair is six",
      "a run of three is nine",
      "another run is twelve",
    ]);
    expect(steps.reduce((t, s) => t + s.points, 0)).toBe(12);
  });

  it("adds the flush and his nob at the end", () => {
    const steps = countingSteps(score("2H 4H 6H JH", "KH"));
    expect(steps.at(-2)!.phrase).toBe("a flush makes five");
    expect(steps.at(-1)!.phrase).toBe("one for his nob is six");
  });

  it("totals the perfect 29", () => {
    const steps = countingSteps(score("5H 5D 5C JS", "5S"));
    expect(steps.at(-1)!.phrase).toBe("one for his nob is twenty-nine");
    expect(steps).toHaveLength(8 + 6 + 1);
  });

  it("has nothing to say for a nineteen", () => {
    expect(countingSteps(score("2H 4D 6C 8S", "KS"))).toEqual([]);
  });
});

/** Advance fake time in small steps, letting React re-render (and schedule the next step) between. */
function tick(ms: number) {
  for (let t = 0; t < ms; t += 50) act(() => vi.advanceTimersByTime(50));
}

describe("CountingShow", () => {
  afterEach(() => vi.useRealTimers());
  const show = [
    {
      type: "hand" as const,
      seat: 1 as const,
      cards: parseCards("7H 8D 8C 9S"),
      score: score("7H 8D 8C 9S", "KS"),
    },
    {
      type: "crib" as const,
      seat: 0 as const,
      cards: parseCards("2H 4D 6C 8S"),
      score: score("2H 4D 6C 8S", "KS", true),
    },
  ];

  it("counts each hand in turn, then finishes", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <CountingShow show={show} cut={parseCard("KS")} names={["You", "Bosun"]} onDone={onDone} />,
    );
    expect(screen.getByText("Bosun's hand")).toBeInTheDocument();
    tick(500 + 550 * 4);
    expect(screen.getByLabelText("Counting the hands")).toHaveTextContent(
      /Fifteen two, fifteen four, a pair is six, a run of three is nine, another run is twelve/,
    );
    tick(HAND_PAUSE_MS + 100);
    expect(screen.getByText("Your crib")).toBeInTheDocument();
    // An empty crib has nothing to call; it says so and moves on after the usual pause.
    expect(screen.getByLabelText("Counting the hands")).toHaveTextContent(
      /Nineteen! Nothing at all/,
    );
    expect(onDone).not.toHaveBeenCalled();
    tick(HAND_PAUSE_MS + 100);
    expect(onDone).toHaveBeenCalled();
  });

  it("skips straight to the totals", () => {
    const onDone = vi.fn();
    render(
      <CountingShow show={show} cut={parseCard("KS")} names={["You", "Bosun"]} onDone={onDone} />,
    );
    act(() => screen.getByRole("button", { name: /Skip/ }).click());
    expect(onDone).toHaveBeenCalled();
  });

  it("says when each hand's total is up, so its peg can move", () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    render(
      <CountingShow
        show={show}
        cut={parseCard("KS")}
        names={["You", "Bosun"]}
        onDone={() => {}}
        onReveal={onReveal}
      />,
    );
    tick(500 + 550 * 3);
    expect(onReveal).not.toHaveBeenCalled();
    tick(550);
    expect(onReveal).toHaveBeenLastCalledWith(1);
    tick(HAND_PAUSE_MS + 100);
    // The empty crib has nothing to call, so its total is up straight away.
    expect(onReveal).toHaveBeenLastCalledWith(2);
  });

  it("hurries to the next total with a tap", () => {
    const onReveal = vi.fn();
    render(
      <CountingShow
        show={show}
        cut={parseCard("KS")}
        names={["You", "Bosun"]}
        onDone={() => {}}
        onReveal={onReveal}
      />,
    );
    const panel = screen.getByLabelText("Counting the hands");
    act(() => panel.click());
    expect(panel).toHaveTextContent(/another run is twelve/);
    expect(onReveal).toHaveBeenLastCalledWith(1);
    act(() => screen.getByRole("button", { name: /Next/ }).click());
    expect(screen.getByText("Your crib")).toBeInTheDocument();
  });
});
