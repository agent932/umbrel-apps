import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  CLASSIC_RULES,
  type GameState,
  type LedgerReason,
  type Reward,
  SHORT_RULES,
  type Seat,
  other,
} from "@pirate/engine";
import { achievements, users } from "../db/schema.js";
import { type MatchInfo, recordMatch } from "../games/record.js";
import { forfeitState } from "../online/rooms.js";
import { playGame, playRounds } from "../test/games.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { signUp, testApp } from "../test/testApp.js";
import { credit } from "./wallet.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => {
  try {
    await expectLedgerMatches(t.db);
  } finally {
    vi.useRealTimers();
    await t.close();
  }
});

/** One seeded bot-vs-bot game (8 rounds, no skunk), reused with the skunk set as needed. */
const GAME = playGame(CLASSIC_RULES, 3);
const game = (skunk: 0 | 1 | 2 = 0): GameState => ({ ...structuredClone(GAME), skunk });

async function user(name: string) {
  await signUp(t.app, name);
  const [u] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, name));
  return u!.id;
}

/** Seats with `winner` in the game's winning seat. */
const seats = (state: GameState, winner: string | null, loser: string | null) =>
  (state.winner === 0 ? [winner, loser] : [loser, winner]) as [string | null, string | null];

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

/** Record a match (a bot game against a medium bot that started 10 minutes ago, unless changed). */
function record(
  state: GameState,
  players: [string | null, string | null],
  info: Partial<MatchInfo> = {},
  forfeitedBy: Seat | null = null,
) {
  return recordMatch(
    t.db,
    { id: randomUUID(), mode: "ai", aiLevel: "medium", createdAt: minutesAgo(10), ...info },
    players,
    state,
    forfeitedBy,
  );
}
const ONLINE = { mode: "online", aiLevel: null } as const;

/** Win as `winner` (and, online, against `loser`); returns the winner's reward. */
async function win(
  winner: string,
  loser: string | null,
  info: Partial<MatchInfo> = {},
  state = game(),
) {
  return (await record(state, seats(state, winner, loser), info)).get(winner)!;
}

const line = (r: Reward | undefined, reason: LedgerReason, key?: string) =>
  r?.lines.find((l) => l.reason === reason && (key === undefined || l.key === key));
const amount = (r: Reward | undefined, reason: LedgerReason) => line(r, reason)?.delta;

describe("doubloons for games", () => {
  it("uses fixtures long enough to pay", () => {
    expect(GAME.history.length).toBeGreaterThanOrEqual(4);
    expect(GAME.skunk).toBe(0);
  });

  it("pays a bot win by level, plus the first win of the day", async () => {
    for (const [level, pay] of [
      ["easy", 20],
      ["medium", 35],
      ["hard", 50],
    ] as const) {
      const u = await user(`Sal_${level}`);
      const reward = await win(u, null, { aiLevel: level });
      expect(line(reward, "botWin")).toEqual({ reason: "botWin", delta: pay });
      expect(amount(reward, "firstWinOfDay")).toBe(50);
      expect(reward.note).toBeNull();
      expect(reward.total).toBe(reward.lines.reduce((s, l) => s + l.delta, 0));
      expect(reward.balance).toBe(await doubloonsOf(t.db, u));
    }
  });

  it("pays the loser nothing for the result, and the computer's seat nothing at all", async () => {
    const u = await user("Anne");
    const state = game(1);
    const rewards = await record(state, seats(state, null, u));
    expect(rewards.size).toBe(1);
    const reward = rewards.get(u)!;
    for (const reason of ["botWin", "skunk", "firstWinOfDay"] as const) {
      expect(line(reward, reason)).toBeUndefined();
    }
    expect(reward.note).toBeNull();
    expect((await ledgerRows(t.db, u)).every((r) => r.reason === "achievement")).toBe(true);
  });

  it("pays online and ranked wins", async () => {
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    expect(amount(await win(anne, bonny, ONLINE), "onlineWin")).toBe(50);
    expect(amount(await win(anne, bonny, { ...ONLINE, ranked: true }), "rankedWin")).toBe(60);
  });

  it("adds a skunk bonus, and pays a double skunk 25 instead", async () => {
    const u = await user("Anne");
    const single = await win(u, null, {}, game(1));
    expect(line(single, "skunk")).toEqual({ reason: "skunk", delta: 10 });
    const double = await win(u, null, {}, game(2));
    expect(line(double, "skunk")).toEqual({ reason: "skunk", delta: 25, key: "double" });
    expect((await ledgerRows(t.db, u, "skunk")).map((r) => r.delta)).toEqual([10, 25]);
  });

  it("pays the first win of the day once per UTC day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
    const u = await user("Anne");
    expect(amount(await win(u, null), "firstWinOfDay")).toBe(50);
    vi.setSystemTime(new Date("2026-10-06T23:59:00Z"));
    expect(line(await win(u, null), "firstWinOfDay")).toBeUndefined();
    vi.setSystemTime(new Date("2026-10-07T00:10:00Z"));
    expect(amount(await win(u, null), "firstWinOfDay")).toBe(50);
    expect((await ledgerRows(t.db, u, "firstWinOfDay")).map((r) => r.refId)).toEqual([
      "2026-10-06",
      "2026-10-07",
    ]);
  });

  it("pays 10 bot wins a day, then stops until the next UTC day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    for (let i = 0; i < 10; i++) expect(amount(await win(anne, null), "botWin")).toBe(35);
    const eleventh = await win(anne, null, {}, game(1));
    expect(line(eleventh, "botWin")).toBeUndefined();
    expect(line(eleventh, "skunk")).toBeUndefined();
    expect(eleventh.note).toBe("botCap");
    expect(await ledgerRows(t.db, anne, "botWin")).toHaveLength(10);
    // Online wins still pay.
    expect(amount(await win(anne, bonny, ONLINE), "onlineWin")).toBe(50);
    vi.setSystemTime(new Date("2026-10-07T08:00:00Z"));
    expect(amount(await win(anne, null), "botWin")).toBe(35);
  });

  it("pays nothing for a game under 3 minutes or 4 rounds, but still pays for other achievements", async () => {
    const anne = await user("Anne");
    const quick = game();
    quick.powersUsed[quick.winner!] = ["spyglass"];
    const fast = await win(anne, null, { createdAt: new Date(Date.now() - 179_000) }, quick);
    expect(fast.note).toBe("short");
    for (const reason of ["botWin", "firstWinOfDay"] as const) {
      expect(line(fast, reason)).toBeUndefined();
    }
    // Using a power pays; First Plunder waits for a game long enough to pay.
    expect(line(fast, "achievement", "power:spyglass")).toMatchObject({ delta: 50 });
    expect(line(fast, "achievement", "firstWin")).toBeUndefined();
    expect(fast.unlocked).toContain("power:spyglass");
    expect(fast.unlocked).not.toContain("firstWin");
    const unlocked = await t.db
      .select({ key: achievements.key })
      .from(achievements)
      .where(eq(achievements.userId, anne));
    expect(unlocked.map((a) => a.key)).not.toContain("firstWin");

    const bonny = await user("Bonny");
    const threeRounds = game();
    threeRounds.history = threeRounds.history.slice(0, 3);
    const few = await win(bonny, null, {}, threeRounds);
    expect(few.note).toBe("short");
    expect(line(few, "botWin")).toBeUndefined();

    // A later full game pays the win, and unlocks and pays First Plunder.
    const later = await win(anne, null);
    expect(amount(later, "botWin")).toBe(35);
    expect(line(later, "achievement", "firstWin")).toEqual({
      reason: "achievement",
      delta: 50,
      key: "firstWin",
    });
    expect(later.unlocked).toContain("firstWin");
  });

  it("keeps Gold Captain for a game long enough to pay, however the rating got there", async () => {
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    /** Anne wins a ranked game that takes her from 1240 to 1256 (Gold). */
    const ranked = (state: GameState, createdAt: Date, forfeitedBy: Seat | null = null) => {
      const gold = { before: 1240, after: 1256, tier: "silver" };
      const rest = { before: 1000, after: 984, tier: "bronze" };
      return recordMatch(
        t.db,
        { id: randomUUID(), ...ONLINE, ranked: true, createdAt },
        seats(state, anne, bonny),
        state,
        forfeitedBy,
        state.winner === 0 ? [gold, rest] : [rest, gold],
      );
    };
    // A quick game, or Bonny forfeiting in the second round, doesn't unlock or pay it.
    const quick = (await ranked(game(), new Date())).get(anne)!;
    expect(quick.note).toBe("short");
    expect(quick.unlocked).not.toContain("gold");
    const early = (await ranked(forfeitState(playRounds(1, 3), 1), minutesAgo(10), 1)).get(anne)!;
    expect(early.note).toBe("earlyForfeit");
    expect(early.unlocked).not.toContain("gold");
    expect(await ledgerRows(t.db, anne, "achievement")).toEqual([]);
    // A full game at Gold does.
    const full = (await ranked(game(), minutesAgo(10))).get(anne)!;
    expect(full.unlocked).toContain("gold");
    expect(line(full, "achievement", "gold")).toMatchObject({ delta: 200 });
  });

  it("pays nothing for an early forfeit and half for a late one", async () => {
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    /** Bonny forfeits a game with `rounds` rounds complete; Anne wins. */
    const forfeit = async (rounds: number, info: Partial<MatchInfo>) => {
      const loser: Seat = 0;
      const state = forfeitState(playRounds(rounds, 3), loser);
      // Even a skunk-sized lead pays no skunk bonus in a forfeit.
      state.skunk = 2;
      const players = (loser === 0 ? [bonny, anne] : [anne, bonny]) as [string, string];
      const rewards = await record(state, players, { ...ONLINE, ...info }, loser);
      expect(state.winner).toBe(other(loser));
      return { winner: rewards.get(anne)!, forfeiter: rewards.get(bonny)! };
    };

    const early = await forfeit(2, {});
    expect(early.winner.note).toBe("earlyForfeit");
    expect(line(early.winner, "onlineWin")).toBeUndefined();
    expect(line(early.winner, "firstWinOfDay")).toBeUndefined();
    // First Plunder isn't used up by a win that can't pay it...
    expect(line(early.winner, "achievement", "firstWin")).toBeUndefined();
    expect(early.winner.unlocked).not.toContain("firstWin");

    const late = await forfeit(5, {});
    expect(late.winner.note).toBe("lateForfeit");
    expect(amount(late.winner, "onlineWin")).toBe(25);
    // ...so the next win that counts unlocks and pays it.
    expect(amount(late.winner, "achievement")).toBe(50);
    expect(late.winner.unlocked).toContain("firstWin");
    expect(line(late.winner, "skunk")).toBeUndefined();
    expect(amount(late.winner, "firstWinOfDay")).toBe(50);
    for (const reason of ["onlineWin", "skunk", "firstWinOfDay"] as const) {
      expect(line(late.forfeiter, reason)).toBeUndefined();
    }
    expect(late.forfeiter.note).toBeNull();

    const ranked = await forfeit(5, { ranked: true });
    expect(amount(ranked.winner, "rankedWin")).toBe(30);
    expect(ranked.winner.note).toBe("lateForfeit");
    expect(await ledgerRows(t.db, anne, "skunk")).toEqual([]);
  });

  it("pays 3 online wins a day against the same opponent, counted per player", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    const cara = await user("Cara");
    expect(amount(await win(anne, bonny, ONLINE), "onlineWin")).toBe(50);
    expect(amount(await win(anne, bonny, { ...ONLINE, ranked: true }), "rankedWin")).toBe(60);
    expect(amount(await win(anne, bonny, ONLINE), "onlineWin")).toBe(50);
    const fourth = await win(anne, bonny, { ...ONLINE, ranked: true });
    expect(line(fourth, "rankedWin")).toBeUndefined();
    expect(fourth.note).toBe("sameOpponent");
    // Another opponent still pays, and so do Bonny's wins over Anne.
    expect(amount(await win(anne, cara, ONLINE), "onlineWin")).toBe(50);
    expect(amount(await win(bonny, anne, ONLINE), "onlineWin")).toBe(50);
    vi.setSystemTime(new Date("2026-10-07T08:00:00Z"));
    expect(amount(await win(anne, bonny, ONLINE), "onlineWin")).toBe(50);
  });

  it("pays 10 online wins a day in all", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    const anne = await user("Anne");
    const crew = [];
    for (const name of ["Bonny", "Cara", "Dot", "Edie", "Fran"]) crew.push(await user(name));
    // 3 + 3 + 3 + 1 paid wins against four opponents.
    for (const [i, times] of [3, 3, 3, 1].entries()) {
      for (let n = 0; n < times; n++) {
        expect(amount(await win(anne, crew[i]!, ONLINE), "onlineWin")).toBe(50);
      }
    }
    const eleventh = await win(anne, crew[4]!, ONLINE);
    expect(line(eleventh, "onlineWin")).toBeUndefined();
    expect(eleventh.note).toBe("onlineCap");
    // Bot wins have their own limit.
    expect(amount(await win(anne, null), "botWin")).toBe(35);
    vi.setSystemTime(new Date("2026-10-07T08:00:00Z"));
    expect(amount(await win(anne, crew[4]!, ONLINE), "onlineWin")).toBe(50);
  });

  it("pays each achievement once, and never for one earned before doubloons", async () => {
    const anne = await user("Anne");
    const first = await win(anne, null);
    expect(line(first, "achievement", "firstWin")).toEqual({
      reason: "achievement",
      delta: 50,
      key: "firstWin",
    });
    const second = await win(anne, null);
    expect(line(second, "achievement", "firstWin")).toBeUndefined();

    // Bonny unlocked First Plunder before doubloons existed: no back-pay.
    const bonny = await user("Bonny");
    await t.db.insert(achievements).values({ userId: bonny, key: "firstWin" });
    expect(line(await win(bonny, null), "achievement", "firstWin")).toBeUndefined();
    expect(await ledgerRows(t.db, bonny, "achievement")).not.toContainEqual(
      expect.objectContaining({ refId: "firstWin" }),
    );
  });

  it("refuses to record the same match twice, paying nothing more", async () => {
    const anne = await user("Anne");
    const state = game();
    const info = { id: randomUUID(), mode: "ai", aiLevel: "medium", createdAt: minutesAgo(10) };
    const players = seats(state, anne, null);
    await recordMatch(t.db, info as MatchInfo, players, state);
    const rows = (await ledgerRows(t.db, anne)).length;
    const balance = await doubloonsOf(t.db, anne);
    await expect(
      t.db.transaction((tx) => recordMatch(tx, info as MatchInfo, players, state)),
    ).rejects.toThrow();
    expect(await ledgerRows(t.db, anne)).toHaveLength(rows);
    expect(await doubloonsOf(t.db, anne)).toBe(balance);
  });

  it("pays half for a short (61-point) game", async () => {
    const short = playGame(SHORT_RULES, 3);
    expect(short.history.length).toBeGreaterThanOrEqual(4);
    const anne = await user("Anne");
    const reward = await win(anne, null, {}, { ...short, skunk: 1 });
    expect(amount(reward, "botWin")).toBe(18);
    expect(amount(reward, "skunk")).toBe(5);
    expect(amount(reward, "firstWinOfDay")).toBe(50);
  });

  it("pays exactly 10 bot wins when the 10th and 11th are recorded together (one at a time on PGlite)", async () => {
    const anne = await user("Anne");
    for (let i = 0; i < 9; i++) await credit(t.db, anne, 35, "botWin", randomUUID());
    const state = game();
    const both = await Promise.all(
      [0, 1].map(() =>
        t.db.transaction((tx) =>
          recordMatch(
            tx,
            { id: randomUUID(), mode: "ai", aiLevel: "medium", createdAt: minutesAgo(10) },
            seats(state, anne, null),
            state,
          ),
        ),
      ),
    );
    expect(await ledgerRows(t.db, anne, "botWin")).toHaveLength(10);
    expect(both.map((r) => r.get(anne)!.note).sort()).toEqual(["botCap", null]);
  });
});
