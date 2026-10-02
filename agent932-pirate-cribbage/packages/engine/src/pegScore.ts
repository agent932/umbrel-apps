import { type Card, cardValue } from "./cards.js";

export interface PegScore {
  fifteen: number;
  thirtyOne: number;
  /** Points for pairs: 2 (pair), 6 (three of a kind), 12 (four of a kind). */
  pairs: number;
  /** Length of the run completed by the last card, or 0. */
  run: number;
  total: number;
}

const PAIR_POINTS = [0, 0, 2, 6, 12];

/**
 * Points for the card just played. `pile` is the current sequence (since the last reset),
 * ending with the card just played.
 */
export function scorePeg(pile: readonly Card[]): PegScore {
  const last = pile.at(-1);
  if (!last) throw new Error("Empty pile");
  const count = pile.reduce((sum, c) => sum + cardValue(c), 0);

  let same = 1;
  while (same < pile.length && pile[pile.length - 1 - same]!.rank === last.rank) same++;
  const pairs = PAIR_POINTS[same]!;

  let run = 0;
  for (let len = pile.length; len >= 3; len--) {
    const ranks = pile
      .slice(-len)
      .map((c) => c.rank)
      .sort((a, b) => a - b);
    if (ranks.every((r, i) => i === 0 || r === ranks[i - 1]! + 1)) {
      run = len;
      break;
    }
  }

  const fifteen = count === 15 ? 2 : 0;
  const thirtyOne = count === 31 ? 2 : 0;
  return { fifteen, thirtyOne, pairs, run, total: fifteen + thirtyOne + pairs + run };
}
