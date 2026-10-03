import {
  type Card,
  type GameState,
  type RoundSeatRecord,
  type Seat,
  analyzeDiscard,
  cardLabel,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { matchPlayers, matches, roundPlayers, rounds } from "../db/schema.js";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface RatingChange {
  before: number;
  after: number;
  tier: string;
}

/** Hand analyzer score for one player's discard, or null if they never discarded this round. */
export function analyzerScore(seat: RoundSeatRecord, isDealer: boolean): number | null {
  if (!seat.atDiscard) return null;
  return analyzeDiscard(seat.atDiscard.hand, seat.atDiscard.discarded, isDealer).score;
}

/** Write a finished game into the stats tables. */
export async function recordMatch(
  tx: Tx | Db,
  game: {
    id: string;
    mode: "ai" | "online";
    aiLevel: "easy" | "medium" | "hard" | null;
    createdAt: Date;
    ranked?: boolean;
    seasonId?: number | null;
  },
  players: [string | null, string | null],
  state: GameState,
  forfeitedBy: Seat | null = null,
  ratings: RatingChange[] | null = null,
) {
  const labels = (cards: Card[]) => cards.map(cardLabel);
  await tx.insert(matches).values({
    id: game.id,
    mode: game.mode,
    aiLevel: game.aiLevel,
    variant: state.rules.pirate ? "pirate" : "classic",
    rules: state.rules,
    firstDealer: state.firstDealer,
    winner: state.winner!,
    skunk: state.skunk,
    forfeitedBy,
    ranked: game.ranked ?? false,
    seasonId: game.seasonId ?? null,
    startedAt: game.createdAt,
    endedAt: new Date(),
  });
  await tx.insert(matchPlayers).values(
    ([0, 1] as const).map((seat) => ({
      matchId: game.id,
      seat,
      userId: players[seat],
      finalScore: state.scores[seat],
      ratingBefore: ratings?.[seat]?.before ?? null,
      ratingAfter: ratings?.[seat]?.after ?? null,
      tier: ratings?.[seat]?.tier ?? null,
    })),
  );
  if (state.history.length === 0) return;
  await tx.insert(rounds).values(
    state.history.map((r) => ({
      matchId: game.id,
      roundNo: r.round,
      dealer: r.dealer,
      cribOwner: r.cribOwner,
      cut: r.cut ? cardLabel(r.cut) : null,
      complete: r.complete,
    })),
  );
  await tx.insert(roundPlayers).values(
    state.history.flatMap((r) =>
      r.seats.map((s, seat) => ({
        matchId: game.id,
        roundNo: r.round,
        seat,
        dealt: labels(s.dealt),
        discarded: labels(s.discarded),
        kept: labels(s.kept),
        pegPoints: s.pegPoints,
        handPoints: s.handPoints,
        cribPoints: s.cribPoints,
        heelsPoints: s.heelsPoints,
        pirateBonus: s.pirateBonus,
        powers: s.powers,
        analyzerScore: analyzerScore(s, r.dealer === seat),
      })),
    ),
  );
}
