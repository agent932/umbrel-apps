import { describe, expect, it } from "vitest";
import {
  cardLabel,
  cardValue,
  createDeck,
  parseCard,
  parseCards,
  removeCards,
  seededRandom,
  shuffle,
} from "./index.js";

describe("cards", () => {
  it("builds a 52-card deck with no duplicates", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardLabel)).size).toBe(52);
  });

  it("counts face cards as 10 and aces as 1", () => {
    expect(cardValue(parseCard("KS"))).toBe(10);
    expect(cardValue(parseCard("AH"))).toBe(1);
    expect(cardValue(parseCard("10D"))).toBe(10);
  });

  it("round-trips labels", () => {
    for (const card of createDeck()) expect(parseCard(cardLabel(card))).toEqual(card);
    expect(parseCard("td")).toEqual({ rank: 10, suit: "D" });
    expect(() => parseCard("1X")).toThrow();
  });

  it("removes cards and rejects missing ones", () => {
    const hand = parseCards("5H 5S JD");
    expect(removeCards(hand, parseCards("5S"))).toEqual(parseCards("5H JD"));
    expect(() => removeCards(hand, parseCards("KC"))).toThrow();
  });

  it("shuffles deterministically with a seed and keeps every card", () => {
    const a = shuffle(createDeck(), seededRandom(42));
    const b = shuffle(createDeck(), seededRandom(42));
    expect(a).toEqual(b);
    expect(a).not.toEqual(createDeck());
    expect(new Set(a.map(cardLabel)).size).toBe(52);
  });
});
