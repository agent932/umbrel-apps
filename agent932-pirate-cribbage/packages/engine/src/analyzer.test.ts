import { describe, expect, it } from "vitest";
import {
  type Action,
  type BotLevel,
  type GameState,
  CRIB_EV,
  analyzeDiscard,
  applyAction,
  botAction,
  cardLabel,
  createDeck,
  createGame,
  parseCards,
  rankDiscards,
  seededRandom,
  shuffle,
} from "./index.js";

describe("crib table", () => {
  it("is symmetric and ranks the classic throws sensibly", () => {
    for (let a = 1; a <= 13; a++)
      for (let b = 1; b <= 13; b++) expect(CRIB_EV[a]![b]).toBe(CRIB_EV[b]![a]);
    // A pair of fives is the best throw to your own crib; king–ace among the worst.
    const all = [];
    for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) all.push(CRIB_EV[a]![b]!);
    expect(CRIB_EV[5]![5]).toBe(Math.max(...all));
    expect(CRIB_EV[13]![1]).toBeLessThan(4.5);
    // Published tables put 5-5 near 8.5–9 and the overall average near 4.5.
    expect(CRIB_EV[5]![5]).toBeGreaterThan(8);
  });
});

describe("rankDiscards", () => {
  it("returns all 15 choices, best first", () => {
    // As pone: keep the near-29 hand and throw the least helpful pair to the opponent's crib.
    const choices = rankDiscards(parseCards("5H 5D 5C JS KH 2C"), false);
    expect(choices).toHaveLength(15);
    for (let i = 1; i < 15; i++) expect(choices[i - 1]!.ev).toBeGreaterThanOrEqual(choices[i]!.ev);
    expect(choices[0]!.keep.map(cardLabel).sort()).toEqual(["5C", "5D", "5H", "JS"]);
  });

  it("protects the dealer's crib and avoids feeding the opponent's", () => {
    // 5-5 is worth keeping in your hand either way, but as pone you'd never throw them.
    const hand = parseCards("5H 5D 9C 10S QH 2C");
    const pone = rankDiscards(hand, false)[0]!;
    expect(pone.discard.some((c) => c.rank === 5)).toBe(false);
  });
});

describe("analyzeDiscard", () => {
  const hand = parseCards("5H 5D 5C JS KH 2C");

  it("scores the best discard 100 and the worst 0", () => {
    const best = analyzeDiscard(hand, parseCards("KH 2C"), false);
    expect(best.score).toBe(100);
    const worstChoice = rankDiscards(hand, false).at(-1)!;
    expect(analyzeDiscard(hand, worstChoice.discard, false).score).toBe(0);
  });

  it("knows a jack is worth throwing into your own crib (nobs)", () => {
    // As dealer, J-2 to the crib edges out K-2.
    expect(analyzeDiscard(hand, parseCards("JS 2C"), true).score).toBe(100);
  });

  it("puts in-between choices in between and accepts either card order", () => {
    const a = analyzeDiscard(hand, parseCards("5H 2C"), true);
    const b = analyzeDiscard(hand, parseCards("2C 5H"), true);
    expect(a.score).toBe(b.score);
    expect(a.score).toBeGreaterThan(0);
    expect(a.score).toBeLessThan(100);
  });

  it("rejects cards that aren't in the hand", () => {
    expect(() => analyzeDiscard(hand, parseCards("AS 2C"), true)).toThrow();
  });
});

function playGame(a: BotLevel, b: BotLevel, seed: number): GameState {
  const random = seededRandom(seed);
  let s = createGame((seed % 2) as 0 | 1);
  while (s.phase !== "gameOver") {
    const action: Action =
      s.phase === "deal"
        ? { type: "deal", deck: shuffle(createDeck(), random) }
        : s.phase === "roundEnd"
          ? { type: "nextRound" }
          : (botAction(s, 0, a, random) ?? botAction(s, 1, b, random))!;
    s = applyAction(s, action).state;
  }
  return s;
}

describe("hard bot", () => {
  it("records the hand it discarded from, and discards optimally", () => {
    const g = playGame("hard", "medium", 7);
    for (const r of g.history) {
      const d = r.seats[0].atDiscard!;
      expect(d.hand).toHaveLength(6);
      expect(analyzeDiscard(d.hand, d.discarded, r.dealer === 0).score).toBe(100);
    }
  });

  it("beats the medium bot more often than not", () => {
    const games = Array.from({ length: 200 }, (_, i) => playGame("hard", "medium", i + 1));
    const wins = games.filter((g) => g.winner === 0).length;
    expect(wins / games.length).toBeGreaterThan(0.5);
  });
});
