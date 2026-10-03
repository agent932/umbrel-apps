import { type Card, cardValue, createDeck, removeCards, sameCard, shuffle } from "./cards.js";
import { rankDiscards } from "./analyzer.js";
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

export type BotLevel = "easy" | "medium" | "hard";

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
    case "cutForDeal": {
      // Any face-down card the opponent hasn't taken.
      const free = Array.from({ length: view.cutForDeal!.deckSize! }, (_, i) => i).filter(
        (i) => !view.cutForDeal!.taken.includes(i),
      );
      return { type: "pickCut", seat, index: pick(free) };
    }
    case "discard": {
      if (level !== "easy" && view.powersNow.includes("parley")) {
        const swap = chooseParley(view.hand, isDealer);
        if (swap) return { type: "parley", seat, card: swap };
      }
      const cards =
        level === "easy"
          ? shuffle(view.hand, random).slice(0, 2)
          : level === "hard"
            ? rankDiscards(view.hand, isDealer)[0]!.discard
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
      return {
        type: "play",
        seat,
        card: level === "hard" ? choosePlayHard(view) : choosePlay(view),
      };
    }
    default:
      return null;
  }
}

/** Cards this player can't see: not in their hand, played, the cut, or their own crib cards. */
function unseenCards(view: PlayerView): Card[] {
  const seen = [
    ...view.hand,
    ...(view.pegging?.played.map((p) => p.card) ?? []),
    ...(view.cut ? [view.cut] : []),
    ...view.myDiscards,
  ];
  return createDeck().filter((c) => !seen.some((s) => sameCard(s, c)));
}

/** C(n, k) as a float; fine for the small numbers here. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/**
 * Expected points of the opponent's best reply, when they hold `held` cards drawn from `unseen`.
 * E[max] = Σ_x P(max ≥ x), with P(max ≥ x) = 1 − C(N − n_x, k) / C(N, k).
 */
function expectedBestReply(pile: Card[], count: number, unseen: Card[], held: number): number {
  if (held === 0) return 0;
  const replies = unseen
    .filter((c) => count + cardValue(c) <= 31)
    .map((c) => scorePeg([...pile, c]).total);
  const top = Math.max(0, ...replies);
  const N = unseen.length;
  const all = choose(N, held);
  let expected = 0;
  for (let x = 1; x <= top; x++) {
    const nx = replies.filter((r) => r >= x).length;
    expected += 1 - choose(N - nx, held) / all;
  }
  return expected;
}

/**
 * Hard pegging: points now, minus the opponent's expected best answer (from the cards it could hold),
 * plus a small bonus for keeping a card that can follow up on what we lead.
 */
export function choosePlayHard(view: PlayerView): Card {
  const peg = view.pegging;
  if (!peg) throw new Error("Not pegging");
  const legal = view.hand.filter((c) => peg.count + cardValue(c) <= 31);
  if (legal.length === 0) throw new Error("No legal play");
  const held = view.opponentCardCount;
  // After a Spyglass we know exactly what's left in the opponent's hand; otherwise it's any unseen card.
  const unseen = unseenCards(view);
  const known = view.spied?.filter((c) => unseen.some((u) => sameCard(u, c)));
  const pool = known && known.length === held ? known : unseen;

  let best = legal[0]!;
  let bestValue = -Infinity;
  for (const card of legal) {
    const pile = [...peg.pile, card];
    const count = peg.count + cardValue(card);
    let value = scorePeg(pile).total;
    // At 31 the count resets, so there's nothing for the opponent to answer.
    if (count !== 31) {
      value -= expectedBestReply(pile, count, pool, held);
      // Holding a card that pairs or makes 15/31 with our own lead sets up the next play.
      const rest = view.hand.filter((c) => !sameCard(c, card));
      if (rest.some((c) => c.rank === card.rank)) value += 0.3;
    }
    // Prefer shedding high cards early, keeping low ones to squeeze in under 31.
    value += cardValue(card) / 200;
    if (value > bestValue) {
      bestValue = value;
      best = card;
    }
  }
  return best;
}
