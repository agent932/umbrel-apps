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

export const POWERS = ["spyglass", "crowsNest", "parley", "pickpocket", "rebury", "belay"] as const;
export type PowerId = (typeof POWERS)[number];

export const POWER_INFO: Record<PowerId, { name: string; description: string }> = {
  spyglass: { name: "Spyglass", description: "Peek at your opponent's hand before you discard." },
  crowsNest: {
    name: "Crow's Nest",
    description: "Reveal the cut card before discarding. Both players see it.",
  },
  parley: {
    name: "Parley",
    description: "Before discarding, swap one card for the top card of the deck.",
  },
  pickpocket: {
    name: "Pickpocket",
    description:
      "After the cut, give one card and take a random face-down card from your opponent.",
  },
  rebury: {
    name: "Rebury",
    description: "After the cut, change which two cards you threw to the crib.",
  },
  belay: {
    name: "Belay That!",
    description: "Take back the card you just played, before your opponent plays.",
  },
};

/** Optional pirate twists. Each can be switched on separately. */
export interface PirateRules {
  /** Land exactly on a treasure hole: +3. */
  treasure: boolean;
  /** Land exactly on a kraken hole: dragged back 4. */
  kraken: boolean;
  /** Ace of Spades cut: the pone steals the crib this round. */
  blackSpot: boolean;
  /** One-use powers each player gets per game. */
  powers: PowerId[];
  /** Points each power costs to use (0 = free). */
  powerCost: number;
}

export interface RuleSet {
  targetScore: number;
  /** Loser below this is skunked. */
  skunkLine: number;
  /** Loser below this is double skunked. */
  doubleSkunkLine: number;
  pirate?: PirateRules;
}

export const CLASSIC_RULES: RuleSet = { targetScore: 121, skunkLine: 91, doubleSkunkLine: 61 };
export const SHORT_RULES: RuleSet = { targetScore: 61, skunkLine: 31, doubleSkunkLine: 0 };
export const PIRATE_RULES: RuleSet = {
  ...CLASSIC_RULES,
  pirate: { treasure: true, kraken: true, blackSpot: true, powers: [...POWERS], powerCost: 0 },
};

export const TREASURE_HOLES = [30, 60, 90];
export const TREASURE_POINTS = 3;
export const KRAKEN_HOLES = [45, 75, 105];
export const KRAKEN_POINTS = -4;

/**
 * "preplay" only happens under pirate rules, between the cut and the first play, while a player
 * still has an after-the-cut power (Pickpocket, Rebury) to use.
 */
export type Phase =
  "cutForDeal" | "deal" | "discard" | "cut" | "preplay" | "pegging" | "roundEnd" | "gameOver";

/**
 * Before the first hand each player cuts the deck; the lower card deals (aces low). A tie means
 * a fresh shuffle and both cut again.
 */
export interface CutForDeal {
  /** The spread deck to pick from; null while waiting for the host to shuffle. */
  deck: Card[] | null;
  /** Index into `deck` each player picked. */
  picks: [number | null, number | null];
  /** The cards cut, once picked (kept after the dealer is decided, for display). */
  cards: [Card | null, Card | null];
}

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

/**
 * One use of a pirate power. `gave`/`got` depend on the power: parley and pickpocket swap one card;
 * rebury gives the old discards and gets the new ones; spyglass gets the opponent's hand;
 * crow's nest gets the cut; belay gives the card taken back.
 */
export interface PowerUse {
  power: PowerId;
  cost: number;
  gave: Card[];
  got: Card[];
}

/** Per-seat facts about one round; the raw material for stats. */
export interface RoundSeatRecord {
  dealt: Card[];
  discarded: Card[];
  kept: Card[];
  pegPoints: number;
  handPoints: number;
  /** Only the crib owner (normally the dealer) has crib points. */
  cribPoints: number | null;
  /** His heels (dealer, cut Jack). */
  heelsPoints: number;
  /** Net points from pirate board twists (treasure, kraken). Kept apart from classic points. */
  pirateBonus: number;
  /** Pirate powers used this round. */
  powers: PowerUse[];
  /** The six cards held and the two thrown at the moment of discarding, for the hand analyzer. */
  atDiscard: { hand: Card[]; discarded: Card[] } | null;
}

export interface RoundRecord {
  round: number;
  dealer: Seat;
  cut: Card | null;
  seats: [RoundSeatRecord, RoundSeatRecord];
  /** Who counts the crib: the dealer, unless the Black Spot was cut. */
  cribOwner: Seat;
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
  /** Pirate powers each player has already used this game. */
  powersUsed: [PowerId[], PowerId[]];
  /** Pre-play readiness (see Phase). */
  ready: [boolean, boolean];
  /** State before the most recent play, for Belay That! Never sent to clients. */
  undo: { seat: Seat; state: GameState } | null;
  /** The cut for first deal (null for games started with a fixed dealer). */
  cutForDeal: CutForDeal | null;
}

export type Action =
  /** Host: spread a freshly shuffled deck for the cut for deal. */
  | { type: "shuffleForCut"; deck: Card[] }
  | { type: "pickCut"; seat: Seat; index: number }
  | { type: "deal"; deck: Card[] }
  | { type: "discard"; seat: Seat; cards: Card[] }
  | { type: "spyglass"; seat: Seat }
  | { type: "crowsNest"; seat: Seat; index?: number }
  | { type: "parley"; seat: Seat; card: Card }
  /** `index` picks the face-down card taken from the opponent; the server randomizes it. */
  | { type: "pickpocket"; seat: Seat; card: Card; index: number }
  | { type: "rebury"; seat: Seat; cards: Card[] }
  | { type: "belay"; seat: Seat }
  | { type: "ready"; seat: Seat }
  | { type: "cut"; index?: number }
  | { type: "play"; seat: Seat; card: Card }
  | { type: "nextRound" };

export type GameEvent =
  | { type: "cutPick"; seat: Seat; card: Card }
  | { type: "cutTie"; cards: [Card, Card] }
  | { type: "cutForDealt"; cards: [Card, Card]; dealer: Seat }
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
  | { type: "treasure"; seat: Seat; points: number; hole: number }
  | { type: "kraken"; seat: Seat; points: number; hole: number }
  | { type: "blackSpot"; seat: Seat }
  /** A power was used. `gave`/`got` may be private to the user; see redactEvent. */
  | { type: "power"; seat: Seat; power: PowerId; cost: number; gave?: Card[]; got?: Card[] }
  | { type: "belayed"; seat: Seat; card: Card }
  | { type: "gameOver"; winner: Seat; skunk: 0 | 1 | 2 };

/**
 * Whether an event plays a pirate scene at the table: a power, buried treasure, the Kraken, the
 * Black Spot, or a skunk. Play waits behind the scene until each player carries on.
 */
export function playsScene(event: GameEvent): boolean {
  switch (event.type) {
    case "power":
    case "treasure":
    case "kraken":
    case "blackSpot":
      return true;
    case "gameOver":
      return event.skunk > 0;
    default:
      return false;
  }
}

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
    powersUsed: [[], []],
    ready: [true, true],
    undo: null,
    cutForDeal: null,
  };
}

/** A new game that starts with both players cutting the deck to see who deals. */
export function newGame(rules: RuleSet = CLASSIC_RULES): GameState {
  return {
    ...createGame(0, rules),
    phase: "cutForDeal",
    cutForDeal: { deck: null, picks: [null, null], cards: [null, null] },
  };
}

/**
 * What the house (not a player) has to do next: shuffle for the cut, or deal. Hosts call this in
 * a loop with a fresh shuffled deck.
 */
export function hostAction(state: GameState, shuffledDeck: () => Card[]): Action | null {
  if (state.phase === "deal") return { type: "deal", deck: shuffledDeck() };
  if (state.phase === "cutForDeal" && !state.cutForDeal?.deck) {
    return { type: "shuffleForCut", deck: shuffledDeck() };
  }
  return null;
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
  pirateBonus: 0,
  powers: [],
  atDiscard: null,
});

export function canPlay(state: GameState, seat: Seat): boolean {
  const count = state.pegging?.count ?? 0;
  return state.hands[seat].some((c) => count + cardValue(c) <= 31);
}

/** Who must act next, or null when the game is waiting on a non-seat action (deal, nextRound). */
export function toAct(state: GameState): Seat[] {
  switch (state.phase) {
    case "cutForDeal":
      return state.cutForDeal?.deck
        ? ([0, 1] as Seat[]).filter((s) => state.cutForDeal!.picks[s] === null)
        : [];
    case "discard":
      return ([0, 1] as Seat[]).filter((s) => state.hands[s].length === 6);
    case "cut":
      return [other(state.dealer)];
    case "preplay":
      return ([0, 1] as Seat[]).filter((s) => !state.ready[s]);
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
    case "shuffleForCut":
      shuffleForCut(ctx, action.deck);
      break;
    case "pickCut":
      pickCut(ctx, action.seat, action.index);
      break;
    case "deal":
      deal(ctx, action.deck);
      break;
    case "discard":
      discard(ctx, action.seat, action.cards);
      break;
    case "spyglass":
    case "crowsNest":
    case "parley":
    case "pickpocket":
    case "rebury":
    case "belay":
      usePower(ctx, action);
      break;
    case "ready":
      if (state.phase !== "preplay") fail("Nothing to be ready for");
      state.ready[action.seat] = true;
      if (state.ready.every(Boolean)) startPegging(ctx);
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

function checkFullDeck(deck: Card[]) {
  const labels = new Set(deck.map(cardLabel));
  if (deck.length !== 52 || labels.size !== 52) fail("Deck must be 52 distinct cards");
  if (createDeck().some((c) => !labels.has(cardLabel(c)))) fail("Deck has unknown cards");
}

function shuffleForCut(ctx: Ctx, deck: Card[]) {
  const cfd = ctx.state.cutForDeal;
  if (ctx.state.phase !== "cutForDeal" || !cfd || cfd.deck) fail("Not time to shuffle for the cut");
  checkFullDeck(deck);
  ctx.state.cutForDeal = { deck: [...deck], picks: [null, null], cards: [null, null] };
}

function pickCut(ctx: Ctx, seat: Seat, index: number) {
  const { state } = ctx;
  const cfd = state.cutForDeal;
  if (state.phase !== "cutForDeal" || !cfd?.deck) fail("Not time to cut for deal");
  if (cfd.picks[seat] !== null) fail("You've already cut");
  if (!Number.isInteger(index) || index < 0 || index >= cfd.deck.length)
    fail("Pick a card from the deck");
  if (cfd.picks[other(seat)] === index) fail("That card's already taken");
  const card = cfd.deck[index]!;
  cfd.picks[seat] = index;
  cfd.cards[seat] = card;
  ctx.events.push({ type: "cutPick", seat, card });

  const [a, b] = cfd.cards;
  if (!a || !b) return;
  if (a.rank === b.rank) {
    // Tie: reshuffle and cut again.
    ctx.events.push({ type: "cutTie", cards: [a, b] });
    state.cutForDeal = { deck: null, picks: [null, null], cards: [null, null] };
    return;
  }
  const dealer: Seat = a.rank < b.rank ? 0 : 1;
  state.dealer = dealer;
  state.firstDealer = dealer;
  state.phase = "deal";
  state.cutForDeal = { deck: null, picks: [null, null], cards: [a, b] };
  ctx.events.push({ type: "cutForDealt", cards: [a, b], dealer });
}

/** Add points; ends the game the moment someone reaches the target. Returns true if the game ended. */
function award(ctx: Ctx, seat: Seat, points: number): boolean {
  const { state } = ctx;
  state.scores[seat] = Math.min(state.scores[seat] + points, state.rules.targetScore);
  if (state.scores[seat] < state.rules.targetScore) {
    boardTwists(ctx, seat);
    return false;
  }

  const loser = state.scores[other(seat)];
  state.winner = seat;
  state.skunk = loser < state.rules.doubleSkunkLine ? 2 : loser < state.rules.skunkLine ? 1 : 0;
  state.phase = "gameOver";
  state.pegging = null;
  if (state.current) state.history.push(state.current);
  ctx.events.push({ type: "gameOver", winner: seat, skunk: state.skunk });
  return true;
}

/** Treasure and kraken holes: landing exactly on one moves the peg again. */
function boardTwists(ctx: Ctx, seat: Seat) {
  const { state } = ctx;
  const pirate = state.rules.pirate;
  const hole = state.scores[seat];
  let points = 0;
  if (pirate?.treasure && TREASURE_HOLES.includes(hole)) {
    points = TREASURE_POINTS;
    ctx.events.push({ type: "treasure", seat, points, hole });
  } else if (pirate?.kraken && KRAKEN_HOLES.includes(hole)) {
    points = KRAKEN_POINTS;
    ctx.events.push({ type: "kraken", seat, points, hole });
  }
  if (points === 0) return;
  // Neither move can reach the target or another special hole, so no further checks.
  state.scores[seat] += points;
  if (state.current) state.current.seats[seat].pirateBonus += points;
}

function deal(ctx: Ctx, deck: Card[]) {
  const { state } = ctx;
  if (state.phase !== "deal") fail("Not time to deal");
  checkFullDeck(deck);

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
    cribOwner: state.dealer,
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
  state.current!.seats[seat].atDiscard = { hand: [...state.hands[seat]], discarded: [...cards] };
  state.hands[seat] = kept;
  state.crib.push(...cards);
  state.current!.seats[seat].discarded = [...cards];
  state.current!.seats[seat].kept = [...kept];
  ctx.events.push({ type: "discarded", seat });

  if (state.hands.every((h) => h.length === 4)) {
    // Crow's Nest may have revealed the cut already.
    if (state.cut) afterCut(ctx);
    else state.phase = "cut";
  }
}

function cut(ctx: Ctx, index: number) {
  if (ctx.state.phase !== "cut") fail("Not time to cut");
  if (revealCut(ctx, index)) return;
  afterCut(ctx);
}

/** Turn up the starter card. Returns true if his heels ended the game. */
function revealCut(ctx: Ctx, index: number): boolean {
  const { state } = ctx;
  // The pone picks a position in the undealt deck; the server randomizes it when they do not.
  if (!Number.isInteger(index) || index < 0 || index >= state.deck.length) fail("Bad cut");
  // Taken out of the deck so a later parley cannot draw it.
  const [card] = state.deck.splice(index, 1) as [Card];
  state.cut = card;
  state.current!.cut = card;
  ctx.events.push({ type: "cut", card });

  if (state.rules.pirate?.blackSpot && card.rank === 1 && card.suit === "S") {
    state.current!.cribOwner = other(state.dealer);
    ctx.events.push({ type: "blackSpot", seat: other(state.dealer) });
  }

  if (card.rank === JACK) {
    state.current!.seats[state.dealer].heelsPoints = 2;
    ctx.events.push({ type: "heels", seat: state.dealer, points: 2 });
    if (award(ctx, state.dealer, 2)) return true;
  }
  return false;
}

/** After the cut: open the pre-play window if anyone has an after-the-cut power, else start pegging. */
function afterCut(ctx: Ctx) {
  const { state } = ctx;
  state.phase = "preplay";
  state.ready = [!hasPreplayPower(state, 0), !hasPreplayPower(state, 1)];
  if (state.ready.every(Boolean)) startPegging(ctx);
}

function hasPreplayPower(state: GameState, seat: Seat): boolean {
  return (["pickpocket", "rebury"] as const).some((p) => powerBlocker(state, seat, p) === null);
}

function startPegging(ctx: Ctx) {
  const { state } = ctx;
  state.phase = "pegging";
  state.ready = [true, true];
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

  const before = structuredClone({ ...state, undo: null });
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
  // Belay That! works until the opponent plays, and not once the round has moved on to the show.
  state.undo = state.phase === "pegging" ? { seat, state: before } : null;
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

  const owner = rec.cribOwner;
  const cribScore = scoreHand(state.crib, cut, true);
  rec.seats[owner].cribPoints = cribScore.total;
  ctx.events.push({ type: "crib", seat: owner, cards: [...state.crib], score: cribScore });
  if (award(ctx, owner, cribScore.total)) return;

  rec.complete = true;
  state.history.push(rec);
  state.pegging = null;
  state.phase = "roundEnd";
}

/** Why `seat` cannot use `power` right now, or null if they can. */
export function powerBlocker(state: GameState, seat: Seat, power: PowerId): string | null {
  const pirate = state.rules.pirate;
  if (!pirate?.powers.includes(power)) return "Not in play this game";
  if (state.powersUsed[seat].includes(power)) return "Already used this game";
  if (state.scores[seat] < pirate.powerCost) return `Costs ${pirate.powerCost} points`;
  const holding = state.hands[seat].length;
  switch (power) {
    case "spyglass":
    case "parley":
      return state.phase === "discard" && holding === 6 ? null : "Use before you discard";
    case "crowsNest":
      return state.phase === "discard" && !state.cut ? null : "Use before both players discard";
    case "pickpocket":
    case "rebury":
      return state.phase === "preplay" ? null : "Use after the cut, before the first play";
    case "belay":
      return state.phase === "pegging" && state.undo?.seat === seat ? null : "Nothing to take back";
  }
}

type PowerAction = Extract<Action, { type: PowerId }>;

function usePower(ctx: Ctx, action: PowerAction) {
  const { seat } = action;
  const blocker = powerBlocker(ctx.state, seat, action.type);
  if (blocker) fail(`${POWER_INFO[action.type].name}: ${blocker}`);

  if (action.type === "belay") {
    // Rewind to just before the play, then charge for the power on the restored state.
    const card = ctx.state.pegging!.played.at(-1)!.card;
    ctx.state = Object.assign(ctx.state, ctx.state.undo!.state);
    ctx.events.push({ type: "belayed", seat, card });
    return chargePower(ctx, seat, "belay", [card], []);
  }

  const { state } = ctx;
  const opp = other(seat);
  const rec = state.current!.seats;
  switch (action.type) {
    case "spyglass":
      return chargePower(ctx, seat, "spyglass", [], [...state.hands[opp]]);

    case "crowsNest": {
      const index = action.index ?? 0;
      if (!Number.isInteger(index) || index < 0 || index >= state.deck.length) fail("Bad cut");
      chargePower(ctx, seat, "crowsNest", [], [state.deck[index]!]);
      revealCut(ctx, index);
      return;
    }

    case "parley": {
      const i = indexOf(state.hands[seat], action.card);
      const got = state.deck.shift()!;
      state.hands[seat][i] = got;
      // The given-up card goes to the bottom of the deck.
      state.deck.push(action.card);
      return chargePower(ctx, seat, "parley", [action.card], [got]);
    }

    case "pickpocket": {
      const i = indexOf(state.hands[seat], action.card);
      if (
        !Number.isInteger(action.index) ||
        action.index < 0 ||
        action.index >= state.hands[opp].length
      )
        fail("Pick one of your opponent's cards");
      const got = state.hands[opp][action.index]!;
      state.hands[seat][i] = got;
      state.hands[opp][action.index] = action.card;
      rec[seat].kept = [...state.hands[seat]];
      rec[opp].kept = [...state.hands[opp]];
      chargePower(ctx, seat, "pickpocket", [action.card], [got]);
      return reopenPreplay(ctx);
    }

    case "rebury": {
      const pool = [...state.hands[seat], ...rec[seat].discarded];
      if (action.cards.length !== 2 || sameCard(action.cards[0]!, action.cards[1]!))
        fail("Choose 2 different cards for the crib");
      let keep: Card[];
      try {
        keep = removeCards(pool, action.cards);
      } catch (e) {
        fail((e as Error).message);
      }
      const old = rec[seat].discarded;
      state.crib = [...removeCards(state.crib, old), ...action.cards];
      state.hands[seat] = keep;
      rec[seat].kept = [...keep];
      rec[seat].discarded = [...action.cards];
      chargePower(ctx, seat, "rebury", old, [...action.cards]);
      return reopenPreplay(ctx);
    }
  }
}

function indexOf(hand: Card[], card: Card): number {
  const i = hand.findIndex((c) => sameCard(c, card));
  if (i < 0) fail(`Card ${cardLabel(card)} not held`);
  return i;
}

/** Mark a power used, take its cost, and record it. */
function chargePower(ctx: Ctx, seat: Seat, power: PowerId, gave: Card[], got: Card[]) {
  const { state } = ctx;
  const cost = state.rules.pirate!.powerCost;
  state.powersUsed[seat].push(power);
  state.scores[seat] -= cost;
  const rec = state.current!.seats[seat];
  rec.pirateBonus -= cost;
  rec.powers.push({ power, cost, gave, got });
  ctx.events.push({ type: "power", seat, power, cost, gave, got });
}

/** After a pre-play power changes the hands, everyone who still has an option gets to react. */
function reopenPreplay(ctx: Ctx) {
  const { state } = ctx;
  state.ready = [!hasPreplayPower(state, 0), !hasPreplayPower(state, 1)];
  if (state.ready.every(Boolean)) startPegging(ctx);
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
  rules: RuleSet;
  /** Pirate powers this player has not used yet. */
  powersLeft: PowerId[];
  /** Powers this player could use right now. */
  powersNow: PowerId[];
  opponentPowersLeft: PowerId[];
  /** Opponent's hand as seen through the Spyglass this round. */
  spied: Card[] | null;
  /** Whether this player still needs to confirm they're ready in the pre-play step. */
  needsReady: boolean;
  /** Cards this player threw to the crib this round. */
  myDiscards: Card[];
  /** This player's six cards and throw at discard time, for the round review. */
  myDiscardDecision: { hand: Card[]; discarded: Card[] } | null;
  cribOwner: Seat | null;
  /** The cut for first deal, while it's happening (and the two cards cut, once decided). */
  cutForDeal: {
    /** Number of face-down cards to pick from, or null while the house shuffles. */
    deckSize: number | null;
    /** Positions already picked (yours or your opponent's), so they can't be picked again. */
    taken: number[];
    cards: [Card | null, Card | null];
  } | null;
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
    rules: state.rules,
    powersLeft: powersLeft(state, seat),
    powersNow: POWERS.filter((p) => powerBlocker(state, seat, p) === null),
    opponentPowersLeft: powersLeft(state, other(seat)),
    spied: state.current?.seats[seat].powers.find((u) => u.power === "spyglass")?.got ?? null,
    needsReady: state.phase === "preplay" && !state.ready[seat],
    myDiscards: [...(state.current?.seats[seat].discarded ?? [])],
    myDiscardDecision: state.current?.seats[seat].atDiscard ?? null,
    cribOwner: state.current?.cribOwner ?? null,
    cutForDeal: state.cutForDeal && {
      deckSize: state.cutForDeal.deck?.length ?? null,
      taken: state.cutForDeal.picks.filter((p): p is number => p !== null),
      cards: [...state.cutForDeal.cards],
    },
  };
}

function powersLeft(state: GameState, seat: Seat): PowerId[] {
  return (state.rules.pirate?.powers ?? []).filter((p) => !state.powersUsed[seat].includes(p));
}

/** Powers whose card details only the user may see. Pickpocket is visible to both (each sees both cards). */
const PRIVATE_POWERS: PowerId[] = ["spyglass", "parley", "rebury"];

/** Strip private details from an event before sending it to `seat`. */
export function redactEvent(event: GameEvent, seat: Seat): GameEvent {
  if (event.type === "power" && event.seat !== seat && PRIVATE_POWERS.includes(event.power)) {
    const { gave: _gave, got: _got, ...rest } = event;
    return rest;
  }
  return event;
}
