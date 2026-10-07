import { and, desc, eq, sql } from "drizzle-orm";
import {
  type GameState,
  type Seat,
  WIN_ACHIEVEMENTS,
  powerAchievement,
  tierFor,
} from "@pirate/engine";
import { achievements, matchPlayers, matches } from "../db/schema.js";
import type { RatingChange, Tx } from "../games/record.js";
import type { Db } from "../db/client.js";

const GOLD_OR_BETTER = new Set(["gold", "platinum", "diamond"]);

/**
 * Give each signed-in player in a just-recorded match the achievements it earned. Already-earned
 * ones are left alone. Win-based ones (WIN_ACHIEVEMENTS) unlock only when `longEnough` (the game
 * was long enough to pay a win), so a quick game can't use them up without paying: they wait for
 * the player's next game that counts. Returns the newly unlocked keys by user.
 */
export async function awardAchievements(
  tx: Tx | Db,
  matchId: string,
  players: [string | null, string | null],
  state: GameState,
  ratings: RatingChange[] | null,
  longEnough: boolean,
): Promise<Map<string, string[]>> {
  const unlocked = new Map<string, string[]>();
  for (const seat of [0, 1] as Seat[]) {
    const userId = players[seat];
    if (!userId) continue;
    let keys: string[] = [];
    const won = state.winner === seat;
    if (won) keys.push("firstWin");
    if (won && state.skunk >= 1) keys.push("skunk");
    if (won && state.skunk === 2) keys.push("doubleSkunk");

    const best = Math.max(
      0,
      ...state.history.map((r) =>
        Math.max(r.seats[seat].handPoints, r.seats[seat].cribPoints ?? 0),
      ),
    );
    if (best >= 24) keys.push("hand24");
    if (best === 29) keys.push("hand29");

    for (const p of state.powersUsed[seat]) keys.push(powerAchievement(p));

    const after = ratings?.[seat]?.after;
    if (after != null && GOLD_OR_BETTER.has(tierFor(after).key)) keys.push("gold");

    if (won && longEnough) {
      const [{ wins }] = (await tx
        .select({ wins: sql<number>`count(*)::int` })
        .from(matchPlayers)
        .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
        .where(and(eq(matchPlayers.userId, userId), eq(matches.winner, matchPlayers.seat)))) as [
        { wins: number },
      ];
      if (wins >= 10) keys.push("wins10");
      const recent = await tx
        .select({ winner: matches.winner, seat: matchPlayers.seat })
        .from(matchPlayers)
        .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
        .where(eq(matchPlayers.userId, userId))
        .orderBy(desc(matches.endedAt))
        .limit(5);
      if (recent.length === 5 && recent.every((m) => m.winner === m.seat)) keys.push("streak5");
    }

    if (!longEnough) keys = keys.filter((key) => !WIN_ACHIEVEMENTS.has(key));
    if (!keys.length) continue;
    const added = await tx
      .insert(achievements)
      .values(keys.map((key) => ({ userId, key, matchId })))
      .onConflictDoNothing()
      .returning({ key: achievements.key });
    if (added.length)
      unlocked.set(
        userId,
        added.map((a) => a.key),
      );
  }
  return unlocked;
}
