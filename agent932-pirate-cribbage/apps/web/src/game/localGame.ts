import {
  type Action,
  type BotLevel,
  type GameState,
  type RuleSet,
  type Seat,
  applyAction,
  createDeck,
  hostAction,
  newGame,
  cryptoRandom,
  shuffle,
  viewFor,
} from "@pirate/engine";
import { initialPresentation, present } from "./present.js";
import type { Presentation, UiAction } from "./types.js";

export const YOU: Seat = 0;
export const BOT: Seat = 1;

export interface LocalGameOptions {
  level: BotLevel;
  rules: RuleSet;
}

/** A guest game run entirely in the browser; saved to localStorage. */
export interface LocalGame {
  options: LocalGameOptions;
  state: GameState;
  p: Presentation;
}

export function names(level: BotLevel): [string, string] {
  return ["You", `Cap'n Bot (${level[0]!.toUpperCase()}${level.slice(1)})`];
}

export function newLocalGame(options: LocalGameOptions): LocalGame {
  // Both cut the deck to see who deals first; the house spreads a shuffled deck straight away.
  let state = newGame(options.rules);
  state = applyAction(state, hostAction(state, shuffledDeck)!).state;
  return { options, state, p: initialPresentation(viewFor(state, YOU)) };
}

const randomIndex = (n: number) => Math.floor(cryptoRandom() * n);

/** Fill in the seat and any randomness, as the server does for online games. */
export function toEngineAction(state: GameState, a: UiAction): Action {
  switch (a.type) {
    case "cut":
      return { type: "cut", index: randomIndex(state.deck.length) };
    case "pickCut":
      return { type: "pickCut", seat: YOU, index: a.index };
    case "crowsNest":
      return { type: "crowsNest", seat: YOU, index: randomIndex(state.deck.length) };
    case "pickpocket":
      return {
        type: "pickpocket",
        seat: YOU,
        card: a.card,
        index: randomIndex(state.hands[BOT].length),
      };
    case "nextRound":
      return { type: "nextRound" };
    case "discard":
    case "rebury":
      return { type: a.type, seat: YOU, cards: a.cards };
    case "play":
    case "parley":
      return { type: a.type, seat: YOU, card: a.card };
    case "ready":
    case "spyglass":
    case "belay":
      return { type: a.type, seat: YOU };
  }
}

/** Apply an engine action. Throws IllegalActionError for bad moves. */
export function step(game: LocalGame, action: Action): LocalGame {
  const { state, events } = applyAction(game.state, action);
  return {
    ...game,
    state,
    p: present(game.p, events, viewFor(state, YOU), names(game.options.level)),
  };
}

const shuffledDeck = () => shuffle(createDeck(), cryptoRandom);

/** What the house does next (shuffle for the cut, or deal), if anything. */
export function houseAction(state: GameState): Action | null {
  return hostAction(state, shuffledDeck);
}

export function dealAction(): Action {
  return { type: "deal", deck: shuffledDeck() };
}

const STORAGE_KEY = "pirate-cribbage:local-game:v2";

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
