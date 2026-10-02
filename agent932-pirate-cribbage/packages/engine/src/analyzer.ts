import { type Card, cardLabel, createDeck, removeCards, sameCard } from "./cards.js";
import { CRIB_EV } from "./cribTable.js";
import { scoreHand } from "./handScore.js";

export interface DiscardChoice {
  discard: [Card, Card];
  keep: Card[];
  /** Average hand points over all 46 possible cuts. */
  handEV: number;
  /** Average crib points of the two thrown cards (added for the dealer, subtracted for the pone). */
  cribEV: number;
  /** handEV ± cribEV: the number discards are ranked by. */
  ev: number;
}

export interface DiscardAnalysis {
  /** All 15 choices, best first. */
  choices: DiscardChoice[];
  best: DiscardChoice;
  chosen: DiscardChoice;
  /** 0 = the worst possible discard, 100 = the best. */
  score: number;
}

export function cribEV(a: Card, b: Card): number {
  return CRIB_EV[a.rank]![b.rank]!;
}

/** Rank all 15 ways to throw 2 of 6 cards, counting the hand over every cut and the crib from the table. */
export function rankDiscards(hand: readonly Card[], isDealer: boolean): DiscardChoice[] {
  if (hand.length !== 6) throw new Error("Need 6 cards");
  const cuts = removeCards(createDeck(), hand);
  const choices: DiscardChoice[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const discard: [Card, Card] = [hand[i]!, hand[j]!];
      const keep = hand.filter((_, k) => k !== i && k !== j);
      const handEV = cuts.reduce((sum, cut) => sum + scoreHand(keep, cut).total, 0) / cuts.length;
      const crib = cribEV(discard[0], discard[1]);
      choices.push({ discard, keep, handEV, cribEV: crib, ev: handEV + (isDealer ? crib : -crib) });
    }
  }
  return choices.sort((a, b) => b.ev - a.ev);
}

const sameDiscard = (d: readonly Card[], e: readonly Card[]) =>
  d.length === 2 && e.every((c) => d.some((x) => sameCard(x, c)));

/**
 * How good a discard was. The score is where it sits between the worst and best of the
 * 15 choices (100 = best), so it reads the same for the dealer and the pone.
 */
export function analyzeDiscard(
  hand: readonly Card[],
  discarded: readonly Card[],
  isDealer: boolean,
): DiscardAnalysis {
  const choices = rankDiscards(hand, isDealer);
  const chosen = choices.find((c) => sameDiscard(c.discard, discarded));
  if (!chosen)
    throw new Error(`${discarded.map(cardLabel).join(" ")} is not a discard from this hand`);
  const best = choices[0]!;
  const worst = choices.at(-1)!;
  const spread = best.ev - worst.ev;
  const score = spread < 1e-9 ? 100 : (100 * (chosen.ev - worst.ev)) / spread;
  return { choices, best, chosen, score: Math.round(score * 10) / 10 };
}
