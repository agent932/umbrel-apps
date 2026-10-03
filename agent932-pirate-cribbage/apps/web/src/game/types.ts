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
}

export interface OnlineInfo {
  /** When the server will move for whoever is holding things up (ms since epoch). */
  deadline: number | null;
  online: [boolean, boolean];
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
