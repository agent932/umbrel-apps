import { describe, expect, it } from "vitest";
import {
  type Action,
  type GameState,
  type MatchForStats,
  type RoundRecord,
  type Seat,
  applyAction,
  botAction,
  computeStats,
  createDeck,
  createGame,
  parseCards,
  seededRandom,
  shuffle,
} from "./index.js";

const seat = (o: Partial<RoundRecord["seats"][0]> = {}): RoundRecord["seats"][0] => ({
  dealt: parseCards("AH 2H 3H 4H 5H 6H"),
  discarded: [],
  kept: [],
  pegPoints: 0,
  handPoints: 0,
  cribPoints: null,
  heelsPoints: 0,
  pirateBonus: 0,
  powers: [],
  ...o,
});

const round = (
  dealer: Seat,
  me: Partial<RoundRecord["seats"][0]>,
  opp: Partial<RoundRecord["seats"][0]>,
  complete = true,
): RoundRecord => ({
  round: 1,
  dealer,
  cut: null,
  cribOwner: dealer,
  complete,
  seats: [seat(me), seat(opp)],
});

const match = (o: Partial<MatchForStats>): MatchForStats => ({
  mySeat: 0,
  firstDealer: 0,
  winner: 0,
  skunk: 0,
  endedAt: "2026-01-01",
  rounds: [],
  ...o,
});

describe("computeStats", () => {
  it("counts wins, losses, rates and who dealt first", () => {
    const s = computeStats([
      match({ winner: 0, firstDealer: 0, endedAt: "1" }),
      match({ winner: 1, firstDealer: 1, endedAt: "2" }),
      match({ winner: 0, firstDealer: 1, endedAt: "3" }),
    ]);
    expect(s).toMatchObject({
      matchesPlayed: 3,
      wins: 2,
      losses: 1,
      startAsDealer: 1,
      startAsPone: 2,
    });
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.winRateStartDealer).toBe(1);
    expect(s.winRateStartPone).toBe(0.5);
  });

  it("tracks current and best streaks in date order, whatever the input order", () => {
    const results = ["W", "W", "W", "L", "W", "L", "L"];
    const matches = results.map((r, i) =>
      match({ winner: r === "W" ? 0 : 1, endedAt: `2026-01-0${i + 1}` }),
    );
    const s = computeStats(matches.reverse());
    expect(s.winStreakMax).toBe(3);
    expect(s.winStreak).toBe(0);
    expect(s.lossStreak).toBe(2);
  });

  it("separates skunks given and taken", () => {
    const s = computeStats([
      match({ winner: 0, skunk: 1 }),
      match({ winner: 1, skunk: 2 }),
      match({ winner: 1 }),
    ]);
    expect(s.skunksGiven).toBe(1);
    expect(s.skunksTaken).toBe(1);
  });

  it("splits round, pegging, hand and crib points by dealer and pone", () => {
    const s = computeStats([
      match({
        rounds: [
          round(
            0,
            { pegPoints: 4, handPoints: 8, cribPoints: 6, heelsPoints: 2 },
            { pegPoints: 1, handPoints: 4 },
          ),
          round(
            1,
            { pegPoints: 2, handPoints: 12 },
            { pegPoints: 3, handPoints: 6, cribPoints: 2 },
          ),
          // Unfinished rounds don't count toward round stats.
          round(0, { pegPoints: 9 }, {}, false),
        ],
      }),
    ]);
    expect(s.roundsPlayed).toBe(2);
    expect(s.round).toMatchObject({
      max: 20,
      maxDealer: 20,
      maxPone: 14,
      avg: 17,
      avgOpp: 8,
      avgDealer: 20,
      avgDealerOpp: 5,
    });
    expect(s.pegging).toMatchObject({ max: 4, avg: 3, avgPone: 2, avgPoneOpp: 3 });
    expect(s.hand).toMatchObject({ max: 12, maxDealer: 8, avg: 10, avgOpp: 5 });
    expect(s.crib).toEqual({ max: 6, avg: 6, avgOpp: 2 });
    expect(s.handCounts[8]).toBe(1);
    expect(s.handCounts[12]).toBe(1);
    expect(s.handBands).toMatchObject({ low: 0, mid: 1, high: 0, lowOpp: 1 });
  });

  it("counts dealt cards by rank across all rounds, including unfinished ones", () => {
    const s = computeStats([match({ rounds: [round(0, {}, {}), round(1, {}, {}, false)] })]);
    expect(s.dealtTotal).toBe(12);
    expect(s.dealtByRank[1]).toBe(2);
    expect(s.dealtByRank[13]).toBe(0);
  });

  it("averages hand analyzer scores when present", () => {
    const s = computeStats([
      match({
        rounds: [round(0, {}, {}), round(1, {}, {})],
        analyzer: [
          [90, 80],
          [100, null],
        ],
      }),
    ]);
    expect(s.analyzer).toEqual({ avg: 95, avgOpp: 80 });
    expect(computeStats([]).analyzer).toEqual({ avg: null, avgOpp: null });
  });

  it("returns zeros, not NaN, with no games", () => {
    const s = computeStats([]);
    expect(s.winRate).toBe(0);
    expect(s.round.avg).toBe(0);
    expect(JSON.stringify(s)).not.toContain("null,null"); // sanity: arrays are numbers
  });

  it("matches the engine's totals over simulated games", () => {
    const random = seededRandom(5);
    const matches: MatchForStats[] = [];
    for (let g = 0; g < 30; g++) {
      let state: GameState = createGame(g % 2 === 0 ? 0 : 1);
      while (state.phase !== "gameOver") {
        const action: Action =
          state.phase === "deal"
            ? { type: "deal", deck: shuffle(createDeck(), random) }
            : state.phase === "roundEnd"
              ? { type: "nextRound" }
              : (botAction(state, 0, "medium", random) ?? botAction(state, 1, "medium", random))!;
        state = applyAction(state, action).state;
      }
      matches.push({
        mySeat: 0,
        firstDealer: state.firstDealer,
        winner: state.winner!,
        skunk: state.skunk,
        endedAt: String(g).padStart(3, "0"),
        rounds: state.history,
      });
    }
    const s = computeStats(matches);
    expect(s.matchesPlayed).toBe(30);
    expect(s.handCounts.reduce((a, b) => a + b, 0)).toBe(s.roundsPlayed);
    expect(s.handBands.low + s.handBands.mid + s.handBands.high).toBeCloseTo(1);
    expect(s.dealtTotal).toBe(matches.reduce((n, m) => n + m.rounds.length * 6, 0));
    expect(s.hand.avg).toBeGreaterThan(6);
  });
});
