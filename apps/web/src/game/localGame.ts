import {
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type RuleSet,
  type Seat,
  applyAction,
  createDeck,
  createGame,
  cryptoRandom,
  describeEvent,
} from "@pirate/engine";

export const YOU: Seat = 0;
export const BOT: Seat = 1;

export interface LocalGameOptions {
  level: BotLevel;
  rules: RuleSet;
}

export interface FeedItem {
  id: number;
  text: string;
  seat: Seat | null;
  points: number;
}

/** Everything the table needs, and what gets saved to localStorage. */
export interface LocalGame {
  options: LocalGameOptions;
  state: GameState;
  /** Where each peg was before its last move (the "back peg" on a real board). */
  backPegs: [number, number];
  feed: FeedItem[];
  /** Hand and crib counts from the most recent show, for the round summary. */
  show: Extract<GameEvent, { type: "hand" | "crib" }>[];
  nextId: number;
}

export function names(level: BotLevel): [string, string] {
  return ["You", `Cap'n Bot (${level[0]!.toUpperCase()}${level.slice(1)})`];
}

export function newLocalGame(options: LocalGameOptions): LocalGame {
  const firstDealer: Seat = cryptoRandom() < 0.5 ? YOU : BOT;
  return {
    options,
    state: createGame(firstDealer, options.rules),
    backPegs: [0, 0],
    feed: [],
    show: [],
    nextId: 1,
  };
}

function eventPoints(e: GameEvent): number {
  switch (e.type) {
    case "played":
      return e.score.total;
    case "hand":
    case "crib":
      return e.score.total;
    case "go":
    case "lastCard":
    case "heels":
    case "treasure":
    case "kraken":
      return e.points;
    case "power":
      return -e.cost;
    default:
      return 0;
  }
}

/** Apply an action and fold its events into the feed. Throws IllegalActionError for bad moves. */
export function step(game: LocalGame, action: Action): LocalGame {
  const { state, events } = applyAction(game.state, action);
  const backPegs: [number, number] = [...game.backPegs];
  for (const seat of [0, 1] as Seat[]) {
    if (state.scores[seat] !== game.state.scores[seat]) backPegs[seat] = game.state.scores[seat];
  }

  let nextId = game.nextId;
  const feed = [...game.feed];
  const label = names(game.options.level);
  for (const e of events) {
    const text = describeEvent(e, label);
    if (!text) continue;
    const seat = "seat" in e ? e.seat : e.type === "gameOver" ? e.winner : null;
    feed.unshift({ id: nextId++, text, seat, points: eventPoints(e) });
  }

  const showEvents = events.filter(
    (e): e is LocalGame["show"][number] => e.type === "hand" || e.type === "crib",
  );
  const show = action.type === "deal" ? [] : [...game.show, ...showEvents];
  return { ...game, state, backPegs, feed: feed.slice(0, 40), show, nextId };
}

export function dealAction(): Action {
  // Shuffle with crypto randomness; the engine checks the deck is a full 52.
  const deck = createDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRandom() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return { type: "deal", deck };
}

const STORAGE_KEY = "pirate-cribbage:local-game";

export function saveGame(game: LocalGame | null) {
  try {
    if (game && game.state.phase !== "gameOver")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the game still works, it just won't resume.
  }
}

export function loadGame(): LocalGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalGame) : null;
  } catch {
    return null;
  }
}
