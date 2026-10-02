import type { BotLevel, Card, GameEvent, PlayerView, Seat } from "@pirate/engine";

/** What the table asks for. Seats and randomness are filled in by whoever runs the game. */
export type UiAction =
  | { type: "discard"; cards: Card[] }
  | { type: "play"; card: Card }
  | { type: "cut" }
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
}

export interface GameController {
  p: Presentation;
  names: [string, string];
  level: BotLevel;
  act: (action: UiAction) => void;
  error: string | null;
  /** True while counting the stats (server games), for the UI note. */
  ranked: boolean;
}
