import {
  type Action,
  type BotLevel,
  type GameState,
  type RuleSet,
  type Seat,
  applyAction,
  createDeck,
  createGame,
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
  const firstDealer: Seat = cryptoRandom() < 0.5 ? YOU : BOT;
  const state = createGame(firstDealer, options.rules);
  return { options, state, p: initialPresentation(viewFor(state, YOU)) };
}

const randomIndex = (n: number) => Math.floor(cryptoRandom() * n);

/** Fill in the seat and any randomness, as the server does for online games. */
export function toEngineAction(state: GameState, a: UiAction): Action {
  switch (a.type) {
    case "cut":
      return { type: "cut", index: randomIndex(state.deck.length) };
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

export function dealAction(): Action {
  return { type: "deal", deck: shuffle(createDeck(), cryptoRandom) };
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
