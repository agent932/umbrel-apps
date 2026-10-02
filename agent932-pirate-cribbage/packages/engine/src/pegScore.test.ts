import { describe, expect, it } from "vitest";
import { parseCards, scorePeg } from "./index.js";

const peg = (pile: string) => scorePeg(parseCards(pile));

describe("scorePeg", () => {
  it("scores fifteen and thirty-one", () => {
    expect(peg("7H 8D")).toMatchObject({ fifteen: 2, total: 2 });
    expect(peg("KH QD AC")).toMatchObject({ total: 0 });
    expect(peg("KH QD AC KS")).toMatchObject({ thirtyOne: 2, total: 2 });
  });

  it("scores pairs, three and four of a kind", () => {
    expect(peg("9H 9D").pairs).toBe(2);
    expect(peg("4H 4D 4C").pairs).toBe(6);
    expect(peg("2H 2D 2C 2S").pairs).toBe(12);
    // Only consecutive cards pair.
    expect(peg("9H 8D 9C").pairs).toBe(0);
  });

  it("scores pairs by rank, not value", () => {
    expect(peg("KH QD").pairs).toBe(0);
  });

  it("scores runs in any order and only at the end of the pile", () => {
    expect(peg("4H 5D 6C").run).toBe(3);
    expect(peg("6H 4D 5C").run).toBe(3);
    expect(peg("4H 5D 3C 6S").run).toBe(4);
    expect(peg("3H 4D 4C").run).toBe(0);
    // A pair inside the sequence breaks the run.
    expect(peg("4H 5D 5C 6S").run).toBe(0);
    // Run of 3 found inside a longer pile when the earlier card breaks it.
    expect(peg("KH 2D 3C 4S").run).toBe(3);
  });

  it("combines run and fifteen", () => {
    // 4 + 5 + 6 = 15 and a run of 3.
    expect(peg("4H 5D 6C")).toMatchObject({ fifteen: 2, run: 3, total: 5 });
  });
});
