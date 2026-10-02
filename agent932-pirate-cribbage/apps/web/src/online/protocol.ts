import type { GameEvent, PlayerView, Seat } from "@pirate/engine";
import type { UiAction } from "../game/types.js";

/** Mirrors apps/server/src/online/protocol.ts. */
export interface Menu {
  variant: "classic" | "pirate";
  powerCost: 0 | 2;
}

export type ClientMessage =
  | { t: "queue"; menu: Menu }
  | { t: "cancelQueue" }
  | { t: "createInvite"; menu: Menu }
  | { t: "cancelInvite" }
  | { t: "joinInvite"; code: string }
  | { t: "watch"; gameId: string }
  | { t: "act"; gameId: string; action: UiAction }
  | { t: "forfeit"; gameId: string };

export type StateMessage = {
  t: "state";
  gameId: string;
  seat: Seat;
  names: [string, string];
  step: { events: GameEvent[]; view: PlayerView };
  deadline: number | null;
  online: [boolean, boolean];
  nextRoundReady: Seat[];
};

export type ServerMessage =
  | { t: "hello"; username: string; activeGames: string[] }
  | { t: "queued" }
  | { t: "invite"; code: string }
  | { t: "matched"; gameId: string }
  | StateMessage
  | { t: "waiting"; gameId: string; for: "nextRound"; ready: Seat[] }
  | { t: "presence"; gameId: string; online: [boolean, boolean] }
  | { t: "timeout"; gameId: string; seat: Seat }
  | { t: "forfeit"; gameId: string; seat: Seat }
  | { t: "error"; message: string; gameId?: string };
