import { z } from "zod";
import { type Card, type Rank, RANKS, SUITS } from "@pirate/engine";

const CardSchema: z.ZodType<Card> = z.object({
  rank: z
    .number()
    .int()
    .refine((r): r is Rank => (RANKS as readonly number[]).includes(r)),
  suit: z.enum(SUITS),
}) as z.ZodType<Card>;

/**
 * Actions a player may send. The seat is never trusted from the client, and anything random
 * (cut position, which card a pickpocket grabs) is chosen by the server.
 */
export const ClientAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("discard"), cards: z.array(CardSchema).length(2) }),
  z.object({ type: z.literal("play"), card: CardSchema }),
  z.object({ type: z.literal("cut") }),
  z.object({ type: z.literal("pickCut"), index: z.number().int().min(0).max(51) }),
  z.object({ type: z.literal("nextRound") }),
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("continue") }),
  z.object({ type: z.literal("spyglass") }),
  z.object({ type: z.literal("crowsNest") }),
  z.object({ type: z.literal("parley"), card: CardSchema }),
  z.object({ type: z.literal("pickpocket"), card: CardSchema }),
  z.object({ type: z.literal("rebury"), cards: z.array(CardSchema).length(2) }),
  z.object({ type: z.literal("belay") }),
]);
export type ClientAction = z.infer<typeof ClientAction>;
