import { type RoundRecord, type Seat, other } from "./game.js";

/** One finished match from one player's point of view. */
export interface MatchForStats {
  mySeat: Seat;
  firstDealer: Seat;
  winner: Seat;
  skunk: 0 | 1 | 2;
  /** For ordering streaks; ISO timestamp. */
  endedAt: string;
  rounds: RoundRecord[];
  /** Hand analyzer score (0–100) per round per seat, when known. */
  analyzer?: ([number | null, number | null] | null)[];
}

export interface SplitStat {
  max: number;
  maxDealer: number;
  maxPone: number;
  avg: number;
  avgOpp: number;
  avgDealer: number;
  avgDealerOpp: number;
  avgPone: number;
  avgPoneOpp: number;
}

export interface PlayerStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Null when you never started that way (a rate of nothing isn't 0). */
  winRateStartDealer: number | null;
  winRateStartPone: number | null;
  winStreak: number;
  winStreakMax: number;
  lossStreak: number;
  startAsDealer: number;
  startAsPone: number;
  /** Matches where you skunked your opponent (double skunks included). */
  skunksGiven: number;
  /** Matches where you were skunked. */
  skunksTaken: number;
  roundsPlayed: number;
  round: SplitStat;
  pegging: SplitStat;
  hand: SplitStat;
  crib: { max: number; avg: number; avgOpp: number };
  analyzer: { avg: number | null; avgOpp: number | null };
  /** Share of hands scoring 0–7, 8–15 and 16–29. */
  handBands: {
    low: number;
    mid: number;
    high: number;
    lowOpp: number;
    midOpp: number;
    highOpp: number;
  };
  /** handCounts[n] = number of hands scoring exactly n (0–29). */
  handCounts: number[];
  handCountsOpp: number[];
  /** Cards dealt to you by rank: index 1 = aces … 13 = kings. */
  dealtByRank: number[];
  dealtTotal: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
const rate = (n: number, d: number) => (d ? n / d : 0);

/** Split one per-round number into the overall / dealer / pone / opponent figures on the sheet. */
function split(rows: { mine: number; opp: number; dealer: boolean }[]): SplitStat {
  const dealer = rows.filter((r) => r.dealer);
  const pone = rows.filter((r) => !r.dealer);
  return {
    max: max(rows.map((r) => r.mine)),
    maxDealer: max(dealer.map((r) => r.mine)),
    maxPone: max(pone.map((r) => r.mine)),
    avg: avg(rows.map((r) => r.mine)),
    avgOpp: avg(rows.map((r) => r.opp)),
    avgDealer: avg(dealer.map((r) => r.mine)),
    avgDealerOpp: avg(dealer.map((r) => r.opp)),
    avgPone: avg(pone.map((r) => r.mine)),
    avgPoneOpp: avg(pone.map((r) => r.opp)),
  };
}

export function computeStats(matches: readonly MatchForStats[]): PlayerStats {
  const ordered = [...matches].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
  const won = (m: MatchForStats) => m.winner === m.mySeat;

  let winStreak = 0;
  let lossStreak = 0;
  let winStreakMax = 0;
  for (const m of ordered) {
    if (won(m)) {
      winStreak++;
      lossStreak = 0;
      winStreakMax = Math.max(winStreakMax, winStreak);
    } else {
      lossStreak++;
      winStreak = 0;
    }
  }

  const startDealer = ordered.filter((m) => m.firstDealer === m.mySeat);
  const startPone = ordered.filter((m) => m.firstDealer !== m.mySeat);
  const wins = ordered.filter(won).length;

  // Round-level numbers only use rounds that were played to the end.
  const rounds: { mine: number; opp: number; dealer: boolean }[] = [];
  const pegs: typeof rounds = [];
  const hands: typeof rounds = [];
  const cribMine: number[] = [];
  const cribOpp: number[] = [];
  const analyzerMine: number[] = [];
  const analyzerOpp: number[] = [];
  const handCounts = new Array<number>(30).fill(0);
  const handCountsOpp = new Array<number>(30).fill(0);
  const dealtByRank = new Array<number>(14).fill(0);

  for (const m of ordered) {
    const me = m.mySeat;
    const opp = other(me);
    m.rounds.forEach((r, i) => {
      for (const card of r.seats[me].dealt) dealtByRank[card.rank]!++;
      const a = m.analyzer?.[i];
      if (a?.[me] != null) analyzerMine.push(a[me]!);
      if (a?.[opp] != null) analyzerOpp.push(a[opp]!);
      if (!r.complete) return;

      const dealer = r.dealer === me;
      const s = r.seats[me];
      const o = r.seats[opp];
      const total = (x: typeof s) =>
        x.pegPoints + x.handPoints + (x.cribPoints ?? 0) + x.heelsPoints;
      rounds.push({ mine: total(s), opp: total(o), dealer });
      pegs.push({ mine: s.pegPoints, opp: o.pegPoints, dealer });
      hands.push({ mine: s.handPoints, opp: o.handPoints, dealer });
      if (s.cribPoints != null) cribMine.push(s.cribPoints);
      if (o.cribPoints != null) cribOpp.push(o.cribPoints);
      handCounts[s.handPoints]!++;
      handCountsOpp[o.handPoints]!++;
    });
  }

  const band = (counts: number[], lo: number, hi: number) =>
    rate(
      counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0),
      hands.length,
    );
  const dealtTotal = dealtByRank.reduce((a, b) => a + b, 0);

  return {
    matchesPlayed: ordered.length,
    wins,
    losses: ordered.length - wins,
    winRate: rate(wins, ordered.length),
    winRateStartDealer: startDealer.length
      ? rate(startDealer.filter(won).length, startDealer.length)
      : null,
    winRateStartPone: startPone.length
      ? rate(startPone.filter(won).length, startPone.length)
      : null,
    winStreak,
    winStreakMax,
    lossStreak,
    startAsDealer: startDealer.length,
    startAsPone: startPone.length,
    skunksGiven: ordered.filter((m) => won(m) && m.skunk > 0).length,
    skunksTaken: ordered.filter((m) => !won(m) && m.skunk > 0).length,
    roundsPlayed: rounds.length,
    round: split(rounds),
    pegging: split(pegs),
    hand: split(hands),
    crib: { max: max(cribMine), avg: avg(cribMine), avgOpp: avg(cribOpp) },
    analyzer: {
      avg: analyzerMine.length ? avg(analyzerMine) : null,
      avgOpp: analyzerOpp.length ? avg(analyzerOpp) : null,
    },
    handBands: {
      low: band(handCounts, 0, 7),
      mid: band(handCounts, 8, 15),
      high: band(handCounts, 16, 29),
      lowOpp: band(handCountsOpp, 0, 7),
      midOpp: band(handCountsOpp, 8, 15),
      highOpp: band(handCountsOpp, 16, 29),
    },
    handCounts,
    handCountsOpp,
    dealtByRank,
    dealtTotal,
  };
}
