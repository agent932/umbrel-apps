import {
  type Card,
  JACK,
  cardLabel,
  cardValue,
  createDeck,
  removeCards,
  sameCard,
} from "./cards.js";
import { type HandScore, scoreHand } from "./handScore.js";
import { type PegScore, scorePeg } from "./pegScore.js";

export type Seat = 0 | 1;

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export interface RuleSet {
  targetScore: number;
  /** Loser below this is skunked. */
  skunkLine: number;
  /** Loser below this is double skunked. */
  doubleSkunkLine: number;
}

export const CLASSIC_RULES: RuleSet = { targetScore: 121, skunkLine: 91, doubleSkunkLine: 61 };
export const SHORT_RULES: RuleSet = { targetScore: 61, skunkLine: 31, doubleSkunkLine: 0 };

export type Phase = "deal" | "discard" | "cut" | "pegging" | "roundEnd" | "gameOver";

export interface PlayedCard {
  seat: Seat;
  card: Card;
}

export interface PeggingState {
  count: number;
  /** Cards in the current sequence (since the last reset to 0). */
  pile: Card[];
  /** Every card played this round, in order. */
  played: PlayedCard[];
  turn: Seat;
  /** Whoever played the most recent card, for go / last-card points. */
  lastPlayer: Seat | null;
}

/** Per-seat facts about one round; the raw material for stats. */
export interface RoundSeatRecord {
  dealt: Card[];
  discarded: Card[];
  kept: Card[];
  pegPoints: number;
  handPoints: number;
  /** Only the dealer has a crib. */
  cribPoints: number | null;
  /** His heels (dealer, cut Jack). */
  heelsPoints: number;
}

export interface RoundRecord {
  round: number;
  dealer: Seat;
  cut: Card | null;
  seats: [RoundSeatRecord, RoundSeatRecord];
  /** False when the game ended mid-round. */
  complete: boolean;
}

export interface GameState {
  rules: RuleSet;
  phase: Phase;
  round: number;
  dealer: Seat;
  firstDealer: Seat;
  scores: [number, number];
  /** Cards currently in each player's hand. */
  hands: [Card[], Card[]];
  crib: Card[];
  /** Undealt cards, top first. */
  deck: Card[];
  cut: Card | null;
  pegging: PeggingState | null;
  winner: Seat | null;
  skunk: 0 | 1 | 2;
  /** Current round record (also pushed to `history` when the round ends). */
  current: RoundRecord | null;
  history: RoundRecord[];
}

export type Action =
  | { type: "deal"; deck: Card[] }
  | { type: "discard"; seat: Seat; cards: Card[] }
  | { type: "cut"; index?: number }
  | { type: "play"; seat: Seat; card: Card }
  | { type: "nextRound" };

export type GameEvent =
  | { type: "dealt"; dealer: Seat }
  | { type: "discarded"; seat: Seat }
  | { type: "cut"; card: Card }
  | { type: "heels"; seat: Seat; points: 2 }
  | { type: "played"; seat: Seat; card: Card; count: number; score: PegScore }
  | { type: "go"; seat: Seat; points: 1 }
  | { type: "lastCard"; seat: Seat; points: 1 }
  | { type: "reset" }
  | { type: "hand"; seat: Seat; cards: Card[]; score: HandScore }
  | { type: "crib"; seat: Seat; cards: Card[]; score: HandScore }
  | { type: "gameOver"; winner: Seat; skunk: 0 | 1 | 2 };

export class IllegalActionError extends Error {}

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export function createGame(firstDealer: Seat, rules: RuleSet = CLASSIC_RULES): GameState {
  return {
    rules,
    phase: "deal",
    round: 0,
    dealer: firstDealer,
    firstDealer,
    scores: [0, 0],
    hands: [[], []],
    crib: [],
    deck: [],
    cut: null,
    pegging: null,
    winner: null,
    skunk: 0,
    current: null,
    history: [],
  };
}

function fail(message: string): never {
  throw new IllegalActionError(message);
}

const emptySeat = (): RoundSeatRecord => ({
  dealt: [],
  discarded: [],
  kept: [],
  pegPoints: 0,
  handPoints: 0,
  cribPoints: null,
  heelsPoints: 0,
});

export function canPlay(state: GameState, seat: Seat): boolean {
  const count = state.pegging?.count ?? 0;
  return state.hands[seat].some((c) => count + cardValue(c) <= 31);
}

/** Who must act next, or null when the game is waiting on a non-seat action (deal, nextRound). */
export function toAct(state: GameState): Seat[] {
  switch (state.phase) {
    case "discard":
      return ([0, 1] as Seat[]).filter((s) => state.hands[s].length === 6);
    case "cut":
      return [other(state.dealer)];
    case "pegging":
      return [state.pegging!.turn];
    default:
      return [];
  }
}

/**
 * Apply one action. Pure: the input state is never modified.
 * Throws IllegalActionError for moves that break the rules.
 */
export function applyAction(input: GameState, action: Action): ActionResult {
  const state = structuredClone(input);
  const events: GameEvent[] = [];
  const ctx = { state, events };

  switch (action.type) {
    case "deal":
      deal(ctx, action.deck);
      break;
    case "discard":
      discard(ctx, action.seat, action.cards);
      break;
    case "cut":
      cut(ctx, action.index ?? 0);
      break;
    case "play":
      play(ctx, action.seat, action.card);
      break;
    case "nextRound":
      if (state.phase !== "roundEnd") fail("Round is not over");
      state.dealer = other(state.dealer);
      state.phase = "deal";
      break;
  }
  return { state, events };
}

interface Ctx {
  state: GameState;
  events: GameEvent[];
}

/** Add points; ends the game the moment someone reaches the target. Returns true if the game ended. */
function award(ctx: Ctx, seat: Seat, points: number): boolean {
  const { state } = ctx;
  state.scores[seat] = Math.min(state.scores[seat] + points, state.rules.targetScore);
  if (state.scores[seat] < state.rules.targetScore) return false;

  const loser = state.scores[other(seat)];
  state.winner = seat;
  state.skunk = loser < state.rules.doubleSkunkLine ? 2 : loser < state.rules.skunkLine ? 1 : 0;
  state.phase = "gameOver";
  state.pegging = null;
  if (state.current) state.history.push(state.current);
  ctx.events.push({ type: "gameOver", winner: seat, skunk: state.skunk });
  return true;
}

function deal(ctx: Ctx, deck: Card[]) {
  const { state } = ctx;
  if (state.phase !== "deal") fail("Not time to deal");
  const labels = new Set(deck.map(cardLabel));
  if (deck.length !== 52 || labels.size !== 52) fail("Deck must be 52 distinct cards");
  if (createDeck().some((c) => !labels.has(cardLabel(c)))) fail("Deck has unknown cards");

  const pone = other(state.dealer);
  const hands: [Card[], Card[]] = [[], []];
  // Deal one at a time, pone first.
  for (let i = 0; i < 12; i++) hands[i % 2 === 0 ? pone : state.dealer].push(deck[i]!);

  state.round += 1;
  state.hands = hands;
  state.deck = deck.slice(12);
  state.crib = [];
  state.cut = null;
  state.pegging = null;
  state.phase = "discard";
  state.current = {
    round: state.round,
    dealer: state.dealer,
    cut: null,
    seats: [emptySeat(), emptySeat()],
    complete: false,
  };
  state.current.seats[0].dealt = [...hands[0]];
  state.current.seats[1].dealt = [...hands[1]];
  ctx.events.push({ type: "dealt", dealer: state.dealer });
}

function discard(ctx: Ctx, seat: Seat, cards: Card[]) {
  const { state } = ctx;
  if (state.phase !== "discard") fail("Not time to discard");
  if (state.hands[seat].length !== 6) fail("Already discarded");
  if (cards.length !== 2) fail("Discard exactly 2 cards");
  if (sameCard(cards[0]!, cards[1]!)) fail("Discard 2 different cards");

  let kept: Card[];
  try {
    kept = removeCards(state.hands[seat], cards);
  } catch (e) {
    fail((e as Error).message);
  }
  state.hands[seat] = kept;
  state.crib.push(...cards);
  state.current!.seats[seat].discarded = [...cards];
  state.current!.seats[seat].kept = [...kept];
  ctx.events.push({ type: "discarded", seat });

  if (state.hands.every((h) => h.length === 4)) state.phase = "cut";
}

function cut(ctx: Ctx, index: number) {
  const { state } = ctx;
  if (state.phase !== "cut") fail("Not time to cut");
  // The pone picks a position in the undealt deck; the server randomizes it when they do not.
  if (!Number.isInteger(index) || index < 0 || index >= state.deck.length) fail("Bad cut");
  const card = state.deck[index]!;
  state.cut = card;
  state.current!.cut = card;
  ctx.events.push({ type: "cut", card });

  if (card.rank === JACK) {
    state.current!.seats[state.dealer].heelsPoints = 2;
    ctx.events.push({ type: "heels", seat: state.dealer, points: 2 });
    if (award(ctx, state.dealer, 2)) return;
  }

  state.phase = "pegging";
  state.pegging = {
    count: 0,
    pile: [],
    played: [],
    turn: other(state.dealer),
    lastPlayer: null,
  };
}

function play(ctx: Ctx, seat: Seat, card: Card) {
  const { state } = ctx;
  if (state.phase !== "pegging") fail("Not time to play");
  const peg = state.pegging!;
  if (peg.turn !== seat) fail("Not your turn");
  const i = state.hands[seat].findIndex((c) => sameCard(c, card));
  if (i < 0) fail(`Card ${cardLabel(card)} not held`);
  if (peg.count + cardValue(card) > 31) fail("Count would go over 31");

  state.hands[seat].splice(i, 1);
  peg.count += cardValue(card);
  peg.pile.push(card);
  peg.played.push({ seat, card });
  peg.lastPlayer = seat;

  const score = scorePeg(peg.pile);
  ctx.events.push({ type: "played", seat, card, count: peg.count, score });
  if (score.total > 0) {
    state.current!.seats[seat].pegPoints += score.total;
    if (award(ctx, seat, score.total)) return;
  }

  if (peg.count === 31) resetCount(ctx);
  advanceTurn(ctx, seat);
}

function resetCount(ctx: Ctx) {
  const peg = ctx.state.pegging!;
  peg.count = 0;
  peg.pile = [];
  ctx.events.push({ type: "reset" });
}

/** After `seat` plays, decide who plays next, handling go and last card automatically. */
function advanceTurn(ctx: Ctx, seat: Seat) {
  const { state } = ctx;
  const peg = state.pegging!;
  const opp = other(seat);

  if (state.hands[0].length === 0 && state.hands[1].length === 0) {
    if (peg.count > 0) {
      state.current!.seats[seat].pegPoints += 1;
      ctx.events.push({ type: "lastCard", seat, points: 1 });
      if (award(ctx, seat, 1)) return;
    }
    show(ctx);
    return;
  }

  if (canPlay(state, opp)) {
    peg.turn = opp;
  } else if (canPlay(state, seat)) {
    // Opponent says go; the same player keeps playing.
    peg.turn = seat;
  } else {
    // Nobody can play: the last player scores the go, then the count restarts.
    state.current!.seats[seat].pegPoints += 1;
    ctx.events.push({ type: "go", seat, points: 1 });
    if (award(ctx, seat, 1)) return;
    resetCount(ctx);
    peg.turn = state.hands[opp].length > 0 ? opp : seat;
  }
}

/** Count hands in order: pone, dealer, crib. Stops as soon as someone wins. */
function show(ctx: Ctx) {
  const { state } = ctx;
  const cut = state.cut!;
  const pone = other(state.dealer);
  const rec = state.current!;

  for (const seat of [pone, state.dealer]) {
    const kept = rec.seats[seat].kept;
    const score = scoreHand(kept, cut);
    rec.seats[seat].handPoints = score.total;
    ctx.events.push({ type: "hand", seat, cards: kept, score });
    if (award(ctx, seat, score.total)) return;
  }

  const cribScore = scoreHand(state.crib, cut, true);
  rec.seats[state.dealer].cribPoints = cribScore.total;
  ctx.events.push({ type: "crib", seat: state.dealer, cards: [...state.crib], score: cribScore });
  if (award(ctx, state.dealer, cribScore.total)) return;

  rec.complete = true;
  state.history.push(rec);
  state.pegging = null;
  state.phase = "roundEnd";
}

/** What one player is allowed to see: the opponent's hand and the deck are hidden. */
export interface PlayerView {
  seat: Seat;
  phase: Phase;
  round: number;
  dealer: Seat;
  scores: [number, number];
  hand: Card[];
  opponentCardCount: number;
  cribCount: number;
  cut: Card | null;
  pegging: PeggingState | null;
  winner: Seat | null;
  skunk: 0 | 1 | 2;
  toAct: Seat[];
}

export function viewFor(state: GameState, seat: Seat): PlayerView {
  return {
    seat,
    phase: state.phase,
    round: state.round,
    dealer: state.dealer,
    scores: [...state.scores],
    hand: [...state.hands[seat]],
    opponentCardCount: state.hands[other(seat)].length,
    cribCount: state.crib.length,
    cut: state.cut,
    pegging: state.pegging && structuredClone(state.pegging),
    winner: state.winner,
    skunk: state.skunk,
    toAct: toAct(state),
  };
}
