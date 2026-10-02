import { type Card, cardValue, createDeck, removeCards, sameCard } from "./cards.js";
import type { PlayerView } from "./game.js";
import { scoreHand } from "./handScore.js";
import { scorePeg } from "./pegScore.js";

export interface DiscardOption {
  discard: [Card, Card];
  keep: Card[];
  /** Average hand points over every possible cut. */
  handEV: number;
}

/** Every way to throw 2 of 6 cards, best average hand first. Basis for the AI and the hand analyzer. */
export function discardOptions(hand: readonly Card[]): DiscardOption[] {
  if (hand.length !== 6) throw new Error("Need 6 cards");
  const cuts = removeCards(createDeck(), hand);
  const options: DiscardOption[] = [];
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const discard: [Card, Card] = [hand[i]!, hand[j]!];
      const keep = hand.filter((_, k) => k !== i && k !== j);
      const total = cuts.reduce((sum, cut) => sum + scoreHand(keep, cut).total, 0);
      options.push({ discard, keep, handEV: total / cuts.length });
    }
  }
  return options.sort((a, b) => b.handEV - a.handEV);
}

/** Rough value of two cards thrown to a crib (pairs, fifteens, fives). */
function cribGuess([a, b]: [Card, Card]): number {
  let v = 0;
  if (a.rank === b.rank) v += 2;
  if (cardValue(a) + cardValue(b) === 15) v += 2;
  if (a.rank === 5) v += 1;
  if (b.rank === 5) v += 1;
  if (Math.abs(a.rank - b.rank) === 1) v += 0.5;
  return v;
}

/** Medium-strength discard: best expected hand, nudged by what the crib gains or gives away. */
export function chooseDiscard(hand: readonly Card[], isDealer: boolean): [Card, Card] {
  const scored = discardOptions(hand).map((o) => ({
    o,
    value: o.handEV + (isDealer ? 1 : -1) * cribGuess(o.discard),
  }));
  scored.sort((a, b) => b.value - a.value);
  return scored[0]!.o.discard;
}

/** Medium-strength pegging: take the most points now, avoid handing over easy 15s and 31s. */
export function choosePlay(view: PlayerView): Card {
  const peg = view.pegging;
  if (!peg) throw new Error("Not pegging");
  const legal = view.hand.filter((c) => peg.count + cardValue(c) <= 31);
  if (legal.length === 0) throw new Error("No legal play");

  let best = legal[0]!;
  let bestValue = -Infinity;
  for (const card of legal) {
    const count = peg.count + cardValue(card);
    let value = scorePeg([...peg.pile, card]).total;
    if (count === 5 || count === 21) value -= 1.5;
    // Leading a 5 invites a 15.
    if (peg.count === 0 && card.rank === 5) value -= 1;
    // Small preference for keeping low cards for later.
    value += cardValue(card) / 100;
    if (value > bestValue) {
      bestValue = value;
      best = card;
    }
  }
  return best;
}

export function holds(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card));
}
