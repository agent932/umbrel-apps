import { type Card, cardValue, createDeck, removeCards, sameCard, shuffle } from "./cards.js";
import { type Action, type GameState, type PlayerView, type Seat, toAct, viewFor } from "./game.js";
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

/**
 * Pirate parley: with a weak hand, swap away the least useful card.
 * Returns the card to give up, or null to keep the hand.
 */
export function chooseParley(hand: readonly Card[], isDealer: boolean): Card | null {
  const [best] = discardOptions(hand);
  if (!best || best.handEV >= 4.5) return null;
  // Give up whichever thrown card is worth less to the crib we are building or feeding.
  const [a, b] = best.discard;
  const worth = (c: Card) => (c.rank === 5 ? 3 : 0) + cardValue(c) / 10;
  return (isDealer ? worth(a) < worth(b) : worth(a) > worth(b)) ? a : b;
}

export function holds(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card));
}

export type BotLevel = "easy" | "medium";

/**
 * The action a bot in `seat` takes now, or null when it has nothing to do.
 * Deal and nextRound are not seat actions; the game host performs them.
 */
export function botAction(
  state: GameState,
  seat: Seat,
  level: BotLevel,
  random: () => number = Math.random,
): Action | null {
  if (!toAct(state).includes(seat)) return null;
  const view = viewFor(state, seat);
  const isDealer = state.dealer === seat;
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

  switch (state.phase) {
    case "discard": {
      if (level === "medium" && view.powersNow.includes("parley")) {
        const swap = chooseParley(view.hand, isDealer);
        if (swap) return { type: "parley", seat, card: swap };
      }
      const cards =
        level === "easy"
          ? shuffle(view.hand, random).slice(0, 2)
          : chooseDiscard(view.hand, isDealer);
      return { type: "discard", seat, cards };
    }
    case "cut":
      return { type: "cut", index: Math.floor(random() * state.deck.length) };
    case "preplay":
      return { type: "ready", seat };
    case "pegging": {
      if (level === "easy") {
        const count = view.pegging!.count;
        return {
          type: "play",
          seat,
          card: pick(view.hand.filter((c) => count + cardValue(c) <= 31)),
        };
      }
      return { type: "play", seat, card: choosePlay(view) };
    }
    default:
      return null;
  }
}
