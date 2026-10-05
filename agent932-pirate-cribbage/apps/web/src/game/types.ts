import type { Emote } from "../online/protocol.js";
import type { BotLevel, Card, GameEvent, PlayerView, Seat } from "@pirate/engine";

/** What the table asks for. Seats and randomness are filled in by whoever runs the game. */
export type UiAction =
  | { type: "discard"; cards: Card[] }
  | { type: "play"; card: Card }
  | { type: "cut" }
  | { type: "pickCut"; index: number }
  | { type: "nextRound" }
  | { type: "ready" }
  | { type: "spyglass" }
  | { type: "crowsNest" }
  | { type: "parley"; card: Card }
  | { type: "pickpocket"; card: Card }
  | { type: "rebury"; cards: Card[] }
  | { type: "belay" };

export interface FeedItem {
  id: number;
  text: string;
  seat: Seat | null;
  points: number;
}

export type ShowEvent = Extract<GameEvent, { type: "hand" | "crib" }>;

/**
 * One stage of a step that ends with the show: the pegging that ended the round, then each hand or
 * crib counted (with any treasure, Kraken or win it caused). The table moves the pegs, plays the
 * sounds and adds the log lines for a stage only when the count reaches it.
 */
export interface RevealStage {
  scores: [number, number];
  backPegs: [number, number];
  events: GameEvent[];
  /** How many of the newest log lines belong to this stage. */
  feed: number;
}

/** What the table displays; built up from views and events. */
export interface Presentation {
  view: PlayerView;
  feed: FeedItem[];
  show: ShowEvent[];
  /** Where each peg was before its last move (the "back peg"). */
  backPegs: [number, number];
  nextId: number;
  /** Events from the latest step, for sounds. */
  lastEvents: GameEvent[];
  /**
   * When the latest show was counted: the pegging stage, then one stage per entry in `show`.
   * Empty otherwise. (Optional: games saved before it existed don't have it.)
   */
  reveal?: RevealStage[];
}

export interface OnlineInfo {
  /** When the server will move for whoever is holding things up (ms since epoch). */
  deadline: number | null;
  online: [boolean, boolean];
  /** Each player's crew portrait (1-8), or null for their initial. */
  avatars: [number | null, number | null];
  ranked: boolean;
  /** The latest call-out from either player, to show by their name. */
  emote: { seat: Seat; emote: Emote; key: number } | null;
  sendEmote: (emote: Emote) => void;
  /** Rematch: nobody asked, you asked, or your opponent asked. */
  rematch: "none" | "waiting" | "offered";
  requestRematch: () => void;
  /** Set when the rematch has started: the new game to go to. */
  rematchGameId: string | null;
  /** When a disconnected player forfeits unless they're back (ms since epoch). */
  returnBy: [number | null, number | null];
  /** Seats that pressed "Next round" on the summary. */
  nextRoundReady: Seat[];
  forfeit: () => void;
  /** Set when a player lost on time or by leaving. */
  forfeitedBy: Seat | null;
}

export interface GameController {
  p: Presentation;
  /** Display names by seat; the viewer's own seat is "You". */
  names: [string, string];
  /** Opponent difficulty, for games vs the computer. */
  level: BotLevel | null;
  act: (action: UiAction) => void;
  error: string | null;
  /** True when the game counts toward stats (server games). */
  ranked: boolean;
  online?: OnlineInfo;
}
