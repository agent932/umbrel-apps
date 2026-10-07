import type { GameEvent, PlayerView, Reward, Seat } from "@pirate/engine";
import type { UiAction } from "../game/types.js";

/** Mirrors apps/server/src/online/protocol.ts. */
export interface Menu {
  variant: "classic" | "pirate";
  powerCost: 0 | 2;
  ranked?: boolean;
}

/** Quick lines a player can call out during an online game. */
export const EMOTES = {
  ahoy: "Ahoy!",
  arr: "Arr!",
  wellPlayed: "Well played, matey",
  shiver: "Shiver me timbers!",
  yoho: "Yo ho ho!",
  oops: "Blimey…",
} as const;
export type Emote = keyof typeof EMOTES;

export type ClientMessage =
  | { t: "queue"; menu: Menu }
  | { t: "cancelQueue" }
  | { t: "createInvite"; menu: Menu }
  | { t: "cancelInvite" }
  | { t: "joinInvite"; code: string }
  | { t: "watch"; gameId: string }
  | { t: "act"; gameId: string; action: UiAction }
  | { t: "forfeit"; gameId: string }
  | { t: "challenge"; friendId: string; menu: Menu }
  | { t: "emote"; gameId: string; emote: Emote }
  | { t: "rematch"; gameId: string }
  | { t: "acceptChallenge"; challengeId: string }
  | { t: "declineChallenge"; challengeId: string };

export type StateMessage = {
  t: "state";
  gameId: string;
  seat: Seat;
  names: [string, string];
  /** Each player's crew portrait (1-8), or null for their initial. */
  avatars?: [number | null, number | null];
  ranked?: boolean;
  step: { events: GameEvent[]; view: PlayerView };
  deadline: number | null;
  online: [boolean, boolean];
  /** When a disconnected player forfeits unless they're back (ms since epoch). */
  returnBy: [number | null, number | null];
  nextRoundReady: Seat[];
  /** Your doubloons, on the gameOver state sent as the game finishes. */
  reward?: Reward;
};

export type ServerMessage =
  | { t: "hello"; username: string; activeGames: string[] }
  | { t: "queued" }
  | { t: "invite"; code: string }
  | { t: "matched"; gameId: string }
  | StateMessage
  | { t: "waiting"; gameId: string; for: "nextRound"; ready: Seat[] }
  | {
      t: "presence";
      gameId: string;
      online: [boolean, boolean];
      returnBy: [number | null, number | null];
    }
  | { t: "timeout"; gameId: string; seat: Seat }
  | { t: "forfeit"; gameId: string; seat: Seat }
  | { t: "challenge"; challengeId: string; from: { id: string; username: string }; menu: Menu }
  | { t: "challengeSent"; challengeId: string; to: string }
  | { t: "challengeDeclined"; challengeId: string; by: string }
  | { t: "friends" }
  | { t: "emote"; gameId: string; seat: Seat; emote: Emote }
  | { t: "rematchOffer"; gameId: string; from: string }
  | { t: "rematchWaiting"; gameId: string }
  | { t: "error"; message: string; gameId?: string };
