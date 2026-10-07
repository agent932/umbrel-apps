import { and, eq, inArray } from "drizzle-orm";
import {
  type MatchForStats,
  type PlayerStats,
  type RoundRecord,
  type Seat,
  TIERS,
  computeStats,
  parseCard,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { matchPlayers, matches, roundPlayers, rounds, users } from "../db/schema.js";

export type Variant = "all" | "classic" | "pirate";

export interface StatsBucket {
  key: string;
  label: string;
  stats: PlayerStats;
}

const BUCKETS = [
  { key: "ai-easy", label: "Easy" },
  { key: "ai-medium", label: "Medium" },
  { key: "ai-hard", label: "Hard" },
  { key: "online", label: "Online" },
  { key: "all", label: "All" },
];

interface LoadedMatch {
  /** Which columns the match counts toward. */
  buckets: string[];
  match: MatchForStats;
}

/** Load one player's finished matches (optionally only those against `opponentId`) ready for computeStats. */
async function loadMatches(
  db: Db,
  userId: string,
  variant: Variant,
  opponentId?: string,
): Promise<LoadedMatch[]> {
  const mine = await db
    .select({
      id: matches.id,
      mode: matches.mode,
      aiLevel: matches.aiLevel,
      variant: matches.variant,
      ranked: matches.ranked,
      firstDealer: matches.firstDealer,
      winner: matches.winner,
      skunk: matches.skunk,
      forfeitedBy: matches.forfeitedBy,
      endedAt: matches.endedAt,
      seat: matchPlayers.seat,
      tier: matchPlayers.tier,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(eq(matchPlayers.userId, userId));
  let chosen = mine.filter((m) => variant === "all" || m.variant === variant);
  if (opponentId) {
    const theirs = chosen.length
      ? await db
          .select({ matchId: matchPlayers.matchId })
          .from(matchPlayers)
          .where(
            and(
              eq(matchPlayers.userId, opponentId),
              inArray(
                matchPlayers.matchId,
                chosen.map((m) => m.id),
              ),
            ),
          )
      : [];
    const shared = new Set(theirs.map((t) => t.matchId));
    chosen = chosen.filter((m) => shared.has(m.id));
  }
  const ids = chosen.map((m) => m.id);

  const roundRows = ids.length
    ? await db.select().from(rounds).where(inArray(rounds.matchId, ids))
    : [];
  const playerRows = ids.length
    ? await db.select().from(roundPlayers).where(inArray(roundPlayers.matchId, ids))
    : [];

  const cards = (labels: string[]) => labels.map(parseCard);
  const seatRows = new Map(playerRows.map((p) => [`${p.matchId}:${p.roundNo}:${p.seat}`, p]));
  const roundsByMatch = new Map<
    string,
    { record: RoundRecord; analyzer: [number | null, number | null] }[]
  >();
  for (const r of roundRows.sort((a, b) => a.roundNo - b.roundNo)) {
    const seats = ([0, 1] as const).map((seat) => {
      const p = seatRows.get(`${r.matchId}:${r.roundNo}:${seat}`)!;
      return {
        dealt: cards(p.dealt),
        discarded: cards(p.discarded),
        kept: cards(p.kept),
        pegPoints: p.pegPoints,
        handPoints: p.handPoints,
        cribPoints: p.cribPoints,
        heelsPoints: p.heelsPoints,
        pirateBonus: p.pirateBonus,
        powers: p.powers,
        atDiscard: null,
      };
    }) as RoundRecord["seats"];
    const list = roundsByMatch.get(r.matchId) ?? [];
    list.push({
      record: {
        round: r.roundNo,
        dealer: r.dealer as Seat,
        cribOwner: r.cribOwner as Seat,
        cut: r.cut ? parseCard(r.cut) : null,
        complete: r.complete,
        seats,
      },
      analyzer: [
        seatRows.get(`${r.matchId}:${r.roundNo}:0`)?.analyzerScore ?? null,
        seatRows.get(`${r.matchId}:${r.roundNo}:1`)?.analyzerScore ?? null,
      ],
    });
    roundsByMatch.set(r.matchId, list);
  }

  return chosen.map((m) => {
    const rs = roundsByMatch.get(m.id) ?? [];
    const buckets = ["all", m.mode === "ai" ? `ai-${m.aiLevel}` : "online"];
    // Ranked games also count toward the tier you were in when the game started.
    if (m.ranked && m.tier) buckets.push(`ranked-${m.tier}`);
    return {
      buckets,
      match: {
        mySeat: m.seat as Seat,
        firstDealer: m.firstDealer as Seat,
        winner: m.winner as Seat,
        skunk: m.skunk as 0 | 1 | 2,
        forfeitedBy: m.forfeitedBy as Seat | null,
        endedAt: m.endedAt.toISOString(),
        rounds: rs.map((r) => r.record),
        analyzer: rs.map((r) => r.analyzer),
      } satisfies MatchForStats,
    };
  });
}

/**
 * Stats columns: each computer level, Online, one per ranked tier you've played in
 * (plus your current tier), and All — like the columns of the original stats sheet.
 */
export async function statsFor(db: Db, userId: string, variant: Variant): Promise<StatsBucket[]> {
  const loaded = await loadMatches(db, userId, variant);
  const [me] = await db
    .select({ rating: users.rating, rankedGames: users.rankedGames })
    .from(users)
    .where(eq(users.id, userId));
  const played = new Set(loaded.flatMap((l) => l.buckets));
  const current =
    me && me.rankedGames > 0 ? [...TIERS].reverse().find((t) => me.rating >= t.min)!.key : null;
  const tiers = TIERS.filter((t) => played.has(`ranked-${t.key}`) || t.key === current).map(
    (t) => ({
      key: `ranked-${t.key}`,
      label: t.name,
    }),
  );
  const columns = [...BUCKETS.slice(0, 4), ...tiers, BUCKETS[4]!];
  return columns.map(({ key, label }) => ({
    key,
    label,
    stats: computeStats(loaded.filter((l) => l.buckets.includes(key)).map((l) => l.match)),
  }));
}

/** Your record against one other player (the "Friends" section of the stats sheet). */
export async function headToHead(db: Db, userId: string, opponentId: string) {
  return computeStats((await loadMatches(db, userId, "all", opponentId)).map((l) => l.match));
}
