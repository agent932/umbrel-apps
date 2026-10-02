import { describe, expect, it } from "vitest";
import { parseCard, parseCards, scoreHand } from "./index.js";

const score = (hand: string, cut: string, isCrib = false) =>
  scoreHand(parseCards(hand), parseCard(cut), isCrib);

describe("scoreHand", () => {
  it.each([
    // [hand, cut, total, description]
    ["5H 5D 5C JS", "5S", 29, "perfect 29"],
    ["5H 5D 5C 5S", "10H", 28, "four fives and a ten"],
    ["5H 5D 5C JH", "5S", 28, "29 without nobs"],
    ["4H 5D 6C 6S", "5S", 24, "double double run"],
    ["7H 8D 8C 9S", "KS", 12, "double run of three with two fifteens"],
    ["AH 2D 3C 4S", "5S", 7, "run of five plus fifteen"],
    ["2H 4D 6C 8S", "KS", 0, "nineteen (zero) hand"],
    ["3H 3D 3C 3S", "9S", 24, "four of a kind and six fifteens"],
    ["10H JD QC KS", "5S", 12, "four-card run with four fifteens"],
  ])("%s / %s = %i (%s)", (hand, cut, total) => {
    expect(score(hand, cut).total).toBe(total);
  });

  it("breaks down the 29 hand", () => {
    const s = score("5H 5D 5C JS", "5S");
    expect(s.points).toEqual({ fifteens: 16, pairs: 12, runs: 0, flush: 0, nobs: 1 });
    expect(s.fifteens).toHaveLength(8);
    expect(s.nobs).toEqual(parseCard("JS"));
  });

  it("counts a 4-card flush in a hand but not in a crib", () => {
    expect(score("2H 4H 6H 8H", "KS").points.flush).toBe(4);
    expect(score("2H 4H 6H 8H", "KS", true).points.flush).toBe(0);
  });

  it("counts a 5-card flush in both hand and crib", () => {
    expect(score("2H 4H 6H 8H", "KH").points.flush).toBe(5);
    expect(score("2H 4H 6H 8H", "KH", true).points.flush).toBe(5);
  });

  it("does not count a flush that needs the cut to complete", () => {
    expect(score("2H 4H 6H 8S", "KH").points.flush).toBe(0);
  });

  it("scores nobs only for the jack matching the cut suit", () => {
    expect(score("JH 2C 4D 8S", "KH").points.nobs).toBe(1);
    expect(score("JH 2C 4D 8S", "KS").points.nobs).toBe(0);
    // A jack as the cut card is not nobs.
    expect(score("2H 4C 6D 8S", "JH").points.nobs).toBe(0);
  });

  it("counts runs only at the longest length", () => {
    // 3-4-5-6 is one run of four, not two runs of three.
    expect(score("3H 4D 5C 6S", "KS").points.runs).toBe(4);
    // A triple run: 3-3-3-4-5.
    expect(score("3H 3D 3C 4S", "5S").points.runs).toBe(9);
  });

  it("does not wrap runs around king to ace", () => {
    expect(score("QH KD AC 2S", "9S").points.runs).toBe(0);
  });

  it("rejects hands that are not 4 cards", () => {
    expect(() => scoreHand(parseCards("5H 5D 5C"), parseCard("5S"))).toThrow();
  });
});
