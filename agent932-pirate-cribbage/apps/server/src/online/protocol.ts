import { z } from "zod";
import type { GameEvent, PlayerView, Reward, Seat } from "@pirate/engine";
import { ClientAction } from "../games/actions.js";

export const Menu = z.object({
  variant: z.enum(["classic", "pirate"]),
  powerCost: z.union([z.literal(0), z.literal(2)]).default(0),
  /** Ranked games always use classic rules, so ratings compare like for like. */
  ranked: z.boolean().default(false),
});
export type Menu = z.infer<typeof Menu>;

/** Quick lines a player can call out during an online game. */
export const EMOTES = ["ahoy", "arr", "wellPlayed", "shiver", "yoho", "oops"] as const;
export const Emote = z.enum(EMOTES);
export type Emote = z.infer<typeof Emote>;

/** Messages from the browser. */
export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("queue"), menu: Menu }),
  z.object({ t: z.literal("cancelQueue") }),
  z.object({ t: z.literal("createInvite"), menu: Menu }),
  z.object({ t: z.literal("cancelInvite") }),
  z.object({ t: z.literal("joinInvite"), code: z.string().max(20) }),
  /** `carryOn`: this app shows the Carry on button on pirate scenes (older iPhone builds don't). */
  z.object({ t: z.literal("watch"), gameId: z.string().uuid(), carryOn: z.boolean().optional() }),
  z.object({ t: z.literal("act"), gameId: z.string().uuid(), action: ClientAction }),
  z.object({ t: z.literal("forfeit"), gameId: z.string().uuid() }),
  z.object({ t: z.literal("challenge"), friendId: z.string().uuid(), menu: Menu }),
  z.object({ t: z.literal("acceptChallenge"), challengeId: z.string().max(40) }),
  z.object({ t: z.literal("declineChallenge"), challengeId: z.string().max(40) }),
  z.object({ t: z.literal("emote"), gameId: z.string().uuid(), emote: Emote }),
  /** Done watching the pirate scene; play goes on once both players are. */
  z.object({ t: z.literal("carryOn"), gameId: z.string().uuid() }),
  /** The game screen closed (the socket stays open for challenges): don't wait for it at scenes. */
  z.object({ t: z.literal("leftTable"), gameId: z.string().uuid() }),
  /** Play the same opponent again with the same rules (unranked games only). */
  z.object({ t: z.literal("rematch"), gameId: z.string().uuid() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Messages to the browser. */
export type ServerMessage =
  | { t: "hello"; username: string; activeGames: string[] }
  | { t: "queued" }
  | { t: "invite"; code: string }
  | { t: "matched"; gameId: string }
  | {
      t: "state";
      gameId: string;
      seat: Seat;
      names: [string, string];
      /** Each player's crew portrait (1-8), or null for their initial. */
      avatars: [number | null, number | null];
      ranked: boolean;
      step: { events: GameEvent[]; view: PlayerView };
      /** When the server will move for whoever is holding things up (ms since epoch). */
      deadline: number | null;
      online: [boolean, boolean];
      returnBy: [number | null, number | null];
      nextRoundReady: Seat[];
      /** Seats still watching the latest pirate scene; play waits until it's empty. */
      sceneWaits: Seat[];
      /** This player's doubloons, on the gameOver state sent as the game finishes. */
      reward?: Reward;
    }
  /** Who's ready: for the next round, or (for "scene") who has carried on past the scene. */
  | { t: "waiting"; gameId: string; for: "nextRound" | "scene"; ready: Seat[] }
  | {
      t: "presence";
      gameId: string;
      online: [boolean, boolean];
      /** When a disconnected player forfeits unless they're back (ms since epoch). */
      returnBy: [number | null, number | null];
    }
  | { t: "timeout"; gameId: string; seat: Seat }
  | { t: "forfeit"; gameId: string; seat: Seat }
  | { t: "challenge"; challengeId: string; from: { id: string; username: string }; menu: Menu }
  | { t: "challengeSent"; challengeId: string; to: string }
  | { t: "challengeDeclined"; challengeId: string; by: string }
  /** Your friends list changed (a request arrived, was accepted, or removed). */
  | { t: "friends" }
  | { t: "emote"; gameId: string; seat: Seat; emote: Emote }
  /** Your opponent wants a rematch of this finished game. */
  | { t: "rematchOffer"; gameId: string; from: string }
  /** You asked for a rematch; waiting for your opponent. */
  | { t: "rematchWaiting"; gameId: string }
  | { t: "error"; message: string; gameId?: string };
