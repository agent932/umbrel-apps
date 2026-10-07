import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_REWARD,
  ADMIN_MAX_DELTA,
  BOT_WIN,
  BOT_WIN_CAP,
  CLASSIC_RULES,
  DAILY_BEST,
  DAILY_PLAYED,
  DOUBLE_SKUNK_BONUS,
  FIRST_WIN_OF_DAY,
  FULL_TARGET,
  MIN_GAME_MS,
  MIN_ROUNDS,
  ONLINE_WIN,
  ONLINE_WIN_CAP,
  RANKED_WIN,
  type RoundRecord,
  SAME_OPPONENT_CAP,
  SHORT_RULES,
  SKUNK_BONUS,
  WIN_ACHIEVEMENTS,
  type WinInput,
  achievementPayout,
  achievementReward,
  longEnough,
  nextDailyReset,
  roundsPlayed,
  utcDay,
  utcDayStart,
  winPayout,
} from "./index.js";

/** Round records with just the "complete" flag (all the economy looks at). */
const rounds = (complete: number, unfinished = 0) =>
  [
    ...Array.from({ length: complete }, () => ({ complete: true })),
    ...Array.from({ length: unfinished }, () => ({ complete: false })),
  ] as RoundRecord[];

/** A full-length, full-pay game won against a medium bot, unless overridden. */
const win = (o: Partial<WinInput> = {}): WinInput => ({
  kind: "bot",
  level: "medium",
  state: { rules: CLASSIC_RULES, skunk: 0, history: rounds(7, 1) },
  forfeited: false,
  durationMs: 10 * 60_000,
  paidBotWinsToday: 0,
  paidOnlineWinsToday: 0,
  paidWinsVsOpponentToday: 0,
  ...o,
});

describe("economy constants", () => {
  it("match the economy plan", () => {
    expect({
      BOT_WIN,
      ONLINE_WIN,
      RANKED_WIN,
      SKUNK_BONUS,
      DOUBLE_SKUNK_BONUS,
      FIRST_WIN_OF_DAY,
      DAILY_PLAYED,
      DAILY_BEST,
      BOT_WIN_CAP,
      ONLINE_WIN_CAP,
      SAME_OPPONENT_CAP,
      MIN_ROUNDS,
      MIN_GAME_MS,
      FULL_TARGET,
      ADMIN_MAX_DELTA,
    }).toMatchInlineSnapshot(`
      {
        "ADMIN_MAX_DELTA": 100000,
        "BOT_WIN": {
          "easy": 20,
          "hard": 50,
          "medium": 35,
        },
        "BOT_WIN_CAP": 10,
        "DAILY_BEST": 25,
        "DAILY_PLAYED": 10,
        "DOUBLE_SKUNK_BONUS": 25,
        "FIRST_WIN_OF_DAY": 50,
        "FULL_TARGET": 121,
        "MIN_GAME_MS": 180000,
        "MIN_ROUNDS": 4,
        "ONLINE_WIN": 50,
        "ONLINE_WIN_CAP": 10,
        "RANKED_WIN": 60,
        "SAME_OPPONENT_CAP": 3,
        "SKUNK_BONUS": 10,
      }
    `);
  });

  it("prices every achievement between 50 and 200, 1,500 in all", () => {
    for (const a of ACHIEVEMENTS) {
      expect(achievementReward(a.key), a.key).toBeGreaterThanOrEqual(50);
      expect(achievementReward(a.key), a.key).toBeLessThanOrEqual(200);
    }
    expect(Object.keys(ACHIEVEMENT_REWARD).sort()).toEqual(ACHIEVEMENTS.map((a) => a.key).sort());
    expect(ACHIEVEMENTS.reduce((sum, a) => sum + achievementReward(a.key), 0)).toBe(1500);
    expect(achievementReward("nope")).toBe(0);
    expect(achievementReward("toString")).toBe(0);
  });

  it("pays win-based achievements only for a game long enough to pay", () => {
    expect([...WIN_ACHIEVEMENTS].sort()).toEqual(
      ["doubleSkunk", "firstWin", "skunk", "streak5", "wins10"].sort(),
    );
    expect(achievementPayout("firstWin", true)).toBe(50);
    expect(achievementPayout("firstWin", false)).toBe(0);
    expect(achievementPayout("doubleSkunk", false)).toBe(0);
    expect(achievementPayout("hand24", false)).toBe(100);
    expect(achievementPayout("power:belay", false)).toBe(50);
  });
});

describe("roundsPlayed", () => {
  it("counts the winning round of a finished game, but not a forfeit's abandoned round", () => {
    expect(roundsPlayed({ history: rounds(4, 1) }, false)).toBe(5);
    expect(roundsPlayed({ history: rounds(4, 1) }, true)).toBe(4);
    expect(roundsPlayed({ history: [] }, false)).toBe(0);
    expect(longEnough({ history: rounds(3, 1) }, false, MIN_GAME_MS)).toBe(true);
    expect(longEnough({ history: rounds(3, 1) }, true, MIN_GAME_MS)).toBe(false);
  });
});

describe("winPayout", () => {
  it("pays each kind of win", () => {
    expect(winPayout(win({ level: "easy" }))).toEqual({
      reason: "botWin",
      win: 20,
      skunk: 0,
      note: null,
    });
    expect(winPayout(win({ level: "medium" })).win).toBe(35);
    expect(winPayout(win({ level: "hard" })).win).toBe(50);
    expect(winPayout(win({ kind: "online", level: null }))).toMatchObject({
      reason: "onlineWin",
      win: 50,
    });
    expect(winPayout(win({ kind: "ranked", level: null }))).toMatchObject({
      reason: "rankedWin",
      win: 60,
    });
  });

  it("refuses a bot win with no level", () => {
    expect(() => winPayout(win({ level: null }))).toThrow(/level/);
  });

  it("adds a skunk bonus, and a double skunk replaces it", () => {
    const state = (skunk: 0 | 1 | 2) => ({ rules: CLASSIC_RULES, skunk, history: rounds(6, 1) });
    expect(winPayout(win({ state: state(1) }))).toMatchObject({ win: 35, skunk: 10 });
    const double = winPayout(win({ state: state(2) }));
    expect(double).toMatchObject({ win: 35, skunk: 25, skunkKey: "double" });
    expect(winPayout(win({ state: state(1) }))).not.toHaveProperty("skunkKey");
  });

  it("pays nothing for a game under 4 rounds or 3 minutes", () => {
    const short = { win: 0, skunk: 0, note: "short" };
    const state = (n: number) => ({
      rules: CLASSIC_RULES,
      skunk: 0 as const,
      history: rounds(n - 1, 1),
    });
    expect(winPayout(win({ state: state(3) }))).toMatchObject(short);
    expect(winPayout(win({ durationMs: 179_999 }))).toMatchObject(short);
    expect(winPayout(win({ state: state(4), durationMs: 180_000 }))).toMatchObject({
      win: 35,
      note: null,
    });
  });

  it("pays nothing for an early forfeit and half for a late one, never with a skunk", () => {
    const forfeit = (complete: number) => ({
      rules: CLASSIC_RULES,
      skunk: 2 as const,
      history: rounds(complete, 1),
    });
    expect(
      winPayout(win({ kind: "online", level: null, forfeited: true, state: forfeit(3) })),
    ).toMatchObject({ win: 0, skunk: 0, note: "earlyForfeit" });
    expect(
      winPayout(win({ kind: "online", level: null, forfeited: true, state: forfeit(5) })),
    ).toEqual({ reason: "onlineWin", win: 25, skunk: 0, note: "lateForfeit" });
    expect(
      winPayout(win({ kind: "ranked", level: null, forfeited: true, state: forfeit(5) })),
    ).toEqual({ reason: "rankedWin", win: 30, skunk: 0, note: "lateForfeit" });
  });

  it("stops paying bot wins after 10 a day", () => {
    expect(winPayout(win({ paidBotWinsToday: 9 })).win).toBe(35);
    expect(winPayout(win({ paidBotWinsToday: 10, state: { ...win().state, skunk: 1 } }))).toEqual({
      reason: "botWin",
      win: 0,
      skunk: 0,
      note: "botCap",
    });
    // Online counts don't touch bot games.
    expect(winPayout(win({ paidOnlineWinsToday: 10, paidWinsVsOpponentToday: 3 })).win).toBe(35);
  });

  it("stops paying online wins after 3 a day against one opponent, or 10 in all", () => {
    const online = (o: Partial<WinInput>) => winPayout(win({ kind: "online", level: null, ...o }));
    expect(online({ paidWinsVsOpponentToday: 2 }).win).toBe(50);
    expect(online({ paidWinsVsOpponentToday: 3 })).toMatchObject({ win: 0, note: "sameOpponent" });
    expect(online({ paidOnlineWinsToday: 9 }).win).toBe(50);
    expect(online({ paidOnlineWinsToday: 10 })).toMatchObject({ win: 0, note: "onlineCap" });
    // Both at once: the daily total is the one reported.
    expect(online({ paidOnlineWinsToday: 10, paidWinsVsOpponentToday: 3 }).note).toBe("onlineCap");
    // Bot wins don't count toward it.
    expect(online({ paidBotWinsToday: 10 }).win).toBe(50);
    // A late forfeit over the cap pays nothing either.
    expect(
      online({
        forfeited: true,
        state: { rules: CLASSIC_RULES, skunk: 0, history: rounds(5, 1) },
        paidWinsVsOpponentToday: 3,
      }).note,
    ).toBe("sameOpponent");
  });

  it("reports a short game as short even when over the cap", () => {
    expect(winPayout(win({ durationMs: 60_000, paidBotWinsToday: 10 })).note).toBe("short");
  });

  it("halves everything in a short (61-point) game, rounding up", () => {
    const state = (skunk: 0 | 1 | 2) => ({ rules: SHORT_RULES, skunk, history: rounds(4, 1) });
    expect(winPayout(win({ level: "easy", state: state(0) })).win).toBe(10);
    expect(winPayout(win({ level: "easy", state: state(1) })).skunk).toBe(5);
    expect(winPayout(win({ level: "easy", state: state(2) })).skunk).toBe(13);
    expect(winPayout(win({ level: "medium", state: state(0) })).win).toBe(18);
  });
});

describe("UTC days", () => {
  it("turns over at midnight UTC", () => {
    const last = new Date("2026-10-06T23:59:59.999Z");
    const first = new Date("2026-10-07T00:00:00.000Z");
    expect(utcDay(last)).toBe("2026-10-06");
    expect(utcDay(first)).toBe("2026-10-07");
    expect(utcDayStart(last).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(utcDayStart(first).toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(nextDailyReset(last).toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(nextDailyReset(first).toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(nextDailyReset(new Date("2026-12-31T12:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});
