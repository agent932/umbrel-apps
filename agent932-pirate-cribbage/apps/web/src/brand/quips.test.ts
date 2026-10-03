import { describe, expect, it } from "vitest";
import { type GameEvent, type HandScore, type PegScore, parseCard } from "@pirate/engine";
import { quipFor } from "./quips.js";

const peg = (p: Partial<PegScore>): GameEvent => ({
  type: "played",
  seat: 0,
  card: parseCard("5H"),
  count: 15,
  score: { fifteen: 0, thirtyOne: 0, pairs: 0, run: 0, total: 0, ...p },
});
const hand = (total: number): GameEvent => ({
  type: "hand",
  seat: 0,
  cards: [],
  score: { total } as HandScore,
});

describe("Peggy's quips", () => {
  it("calls out pegging points", () => {
    expect(quipFor([peg({ fifteen: 2, total: 2 })], 0)).toBe("Fifteen-two! Awk!");
    expect(quipFor([peg({ pairs: 6, total: 6 })], 0)).toBe("Three of a kind! Awk!");
  });

  it("picks the most exciting moment in a batch", () => {
    expect(quipFor([peg({ fifteen: 2, total: 2 }), hand(29)], 0)).toBe("TWENTY-NINE!!! SQUAWK!!!");
    expect(quipFor([hand(8), { type: "gameOver", winner: 0, skunk: 1 }], 0)).toMatch(/Skunked 'em/);
  });

  it("stays quiet for ordinary moments", () => {
    expect(quipFor([peg({}), hand(6), { type: "cut", card: parseCard("2C") }], 0)).toBeNull();
  });

  it("cheers for you and commiserates when you lose", () => {
    expect(quipFor([{ type: "gameOver", winner: 1, skunk: 0 }], 0)).toBe("Defeat… Awk.");
    expect(quipFor([{ type: "gameOver", winner: 1, skunk: 0 }], 1)).toBe("Victory! Awk! Awk!");
  });
});
