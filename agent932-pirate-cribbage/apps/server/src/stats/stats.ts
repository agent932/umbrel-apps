import { eq, inArray } from "drizzle-orm";
import {
  type MatchForStats,
  type PlayerStats,
  type RoundRecord,
  type Seat,
  computeStats,
  parseCard,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { matchPlayers, matches, roundPlayers, rounds } from "../db/schema.js";

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

export async function statsFor(db: Db, userId: string, variant: Variant): Promise<StatsBucket[]> {
  const mine = await db
    .select({
      id: matches.id,
      mode: matches.mode,
      aiLevel: matches.aiLevel,
      variant: matches.variant,
      firstDealer: matches.firstDealer,
      winner: matches.winner,
      skunk: matches.skunk,
      endedAt: matches.endedAt,
      seat: matchPlayers.seat,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(eq(matchPlayers.userId, userId));
  const chosen = mine.filter((m) => variant === "all" || m.variant === variant);
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

  const forStats = chosen.map((m) => {
    const rs = roundsByMatch.get(m.id) ?? [];
    return {
      bucket: m.mode === "ai" ? `ai-${m.aiLevel}` : "online",
      match: {
        mySeat: m.seat as Seat,
        firstDealer: m.firstDealer as Seat,
        winner: m.winner as Seat,
        skunk: m.skunk as 0 | 1 | 2,
        endedAt: m.endedAt.toISOString(),
        rounds: rs.map((r) => r.record),
        analyzer: rs.map((r) => r.analyzer),
      } satisfies MatchForStats,
    };
  });

  return BUCKETS.map(({ key, label }) => ({
    key,
    label,
    stats: computeStats(
      forStats.filter((f) => key === "all" || f.bucket === key).map((f) => f.match),
    ),
  }));
}
