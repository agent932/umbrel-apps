import { type Card, JACK, cardValue } from "./cards.js";

export interface HandScore {
  fifteens: Card[][];
  pairs: Card[][];
  runs: Card[][];
  flush: Card[];
  nobs: Card | null;
  points: { fifteens: number; pairs: number; runs: number; flush: number; nobs: number };
  total: number;
}

/** All non-empty subsets of `cards`, smallest first. */
function subsets<T>(cards: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << cards.length; mask++) {
    out.push(cards.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

function isRun(cards: readonly Card[]): boolean {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1);
}

/**
 * Score a 4-card hand (or crib) with the cut card.
 * The crib only scores a flush when all five cards share a suit.
 */
export function scoreHand(hand: readonly Card[], cut: Card, isCrib = false): HandScore {
  if (hand.length !== 4) throw new Error(`A hand has 4 cards, got ${hand.length}`);
  const all = [...hand, cut];
  const subs = subsets(all);

  const fifteens = subs.filter((s) => s.reduce((sum, c) => sum + cardValue(c), 0) === 15);
  const pairs = subs.filter((s) => s.length === 2 && s[0]!.rank === s[1]!.rank);

  let runs: Card[][] = [];
  for (let len = 5; len >= 3 && runs.length === 0; len--) {
    runs = subs.filter((s) => s.length === len && isRun(s));
  }

  let flush: Card[] = [];
  if (hand.every((c) => c.suit === hand[0]!.suit)) {
    if (cut.suit === hand[0]!.suit) flush = all;
    else if (!isCrib) flush = [...hand];
  }

  const nobs = hand.find((c) => c.rank === JACK && c.suit === cut.suit) ?? null;

  const points = {
    fifteens: fifteens.length * 2,
    pairs: pairs.length * 2,
    runs: runs.reduce((sum, r) => sum + r.length, 0),
    flush: flush.length,
    nobs: nobs ? 1 : 0,
  };
  const total = points.fifteens + points.pairs + points.runs + points.flush + points.nobs;
  return { fifteens, pairs, runs, flush, nobs, points, total };
}
