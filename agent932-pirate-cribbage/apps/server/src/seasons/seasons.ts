import { asc, desc, eq, gt, isNull } from "drizzle-orm";
import { seasonReset, tierFor } from "@pirate/engine";
import type { Db } from "../db/client.js";
import { seasonResults, seasons, users } from "../db/schema.js";
import type { Tx } from "../games/record.js";

export async function currentSeason(db: Db | Tx) {
  const [s] = await db
    .select()
    .from(seasons)
    .where(isNull(seasons.endedAt))
    .orderBy(desc(seasons.id))
    .limit(1);
  // Migration 0004 creates Season 1, so there is always one; this is just a safety net.
  if (s) return s;
  const [created] = await db.insert(seasons).values({ id: 1, name: "Season 1" }).returning();
  return created!;
}

export async function listSeasons(db: Db) {
  return db.select().from(seasons).orderBy(desc(seasons.id));
}

export async function seasonStandings(db: Db, seasonId: number) {
  return db
    .select({
      userId: seasonResults.userId,
      username: users.username,
      rank: seasonResults.rank,
      rating: seasonResults.rating,
      tier: seasonResults.tier,
      rankedGames: seasonResults.rankedGames,
    })
    .from(seasonResults)
    .innerJoin(users, eq(users.id, seasonResults.userId))
    .where(eq(seasonResults.seasonId, seasonId))
    .orderBy(asc(seasonResults.rank));
}

/**
 * Close the current season: record everyone's final standing, pull every rating halfway back
 * to 1000, reset ranked game counts, and open the next season. All in one transaction.
 */
export async function endSeason(db: Db) {
  return db.transaction(async (tx) => {
    const season = await currentSeason(tx);
    const ranked = await tx
      .select({ id: users.id, rating: users.rating, rankedGames: users.rankedGames })
      .from(users)
      .where(gt(users.rankedGames, 0))
      .orderBy(desc(users.rating), asc(users.username))
      .for("update");
    if (ranked.length) {
      await tx.insert(seasonResults).values(
        ranked.map((u, i) => ({
          seasonId: season.id,
          userId: u.id,
          rank: i + 1,
          rating: u.rating,
          tier: tierFor(u.rating).key,
          rankedGames: u.rankedGames,
        })),
      );
    }
    const everyone = await tx
      .select({ id: users.id, rating: users.rating })
      .from(users)
      .for("update");
    for (const u of everyone) {
      const rating = seasonReset(u.rating);
      if (rating !== u.rating) await tx.update(users).set({ rating }).where(eq(users.id, u.id));
    }
    await tx.update(users).set({ rankedGames: 0 }).where(gt(users.rankedGames, 0));
    await tx.update(seasons).set({ endedAt: new Date() }).where(eq(seasons.id, season.id));
    const [next] = await tx
      .insert(seasons)
      .values({ id: season.id + 1, name: `Season ${season.id + 1}` })
      .returning();
    return { ended: { ...season, players: ranked.length }, started: next! };
  });
}
