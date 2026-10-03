import { z } from "zod";
import type { GameEvent, PlayerView, Seat } from "@pirate/engine";
import { ClientAction } from "../games/actions.js";

export const Menu = z.object({
  variant: z.enum(["classic", "pirate"]),
  powerCost: z.union([z.literal(0), z.literal(2)]).default(0),
  /** Ranked games always use classic rules, so ratings compare like for like. */
  ranked: z.boolean().default(false),
});
export type Menu = z.infer<typeof Menu>;

/** Messages from the browser. */
export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("queue"), menu: Menu }),
  z.object({ t: z.literal("cancelQueue") }),
  z.object({ t: z.literal("createInvite"), menu: Menu }),
  z.object({ t: z.literal("cancelInvite") }),
  z.object({ t: z.literal("joinInvite"), code: z.string().max(20) }),
  z.object({ t: z.literal("watch"), gameId: z.string().uuid() }),
  z.object({ t: z.literal("act"), gameId: z.string().uuid(), action: ClientAction }),
  z.object({ t: z.literal("forfeit"), gameId: z.string().uuid() }),
  z.object({ t: z.literal("challenge"), friendId: z.string().uuid(), menu: Menu }),
  z.object({ t: z.literal("acceptChallenge"), challengeId: z.string().max(40) }),
  z.object({ t: z.literal("declineChallenge"), challengeId: z.string().max(40) }),
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
      step: { events: GameEvent[]; view: PlayerView };
      /** When the server will move for whoever is holding things up (ms since epoch). */
      deadline: number | null;
      online: [boolean, boolean];
      returnBy: [number | null, number | null];
      nextRoundReady: Seat[];
    }
  | { t: "waiting"; gameId: string; for: "nextRound"; ready: Seat[] }
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
  | { t: "error"; message: string; gameId?: string };
