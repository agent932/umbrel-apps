import { and, count, eq, gte, inArray } from "drizzle-orm";
import {
  DAILY_BEST,
  DAILY_PLAYED,
  type DoubloonLine,
  FIRST_WIN_OF_DAY,
  type GameState,
  type LedgerReason,
  type Reward,
  type Seat,
  type WinNote,
  achievementPayout,
  longEnough,
  other,
  utcDay,
  utcDayStart,
  winPayout,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { matchPlayers, walletLedger } from "../db/schema.js";
import type { MatchInfo, Tx } from "../games/record.js";
import { balanceOf, credit } from "./wallet.js";

/** Pays a player's lines one by one, keeping the ones that paid and the balance after them. */
function payer(exec: Tx | Db, userId: string, balance: number, now: Date) {
  const lines: DoubloonLine[] = [];
  return {
    async pay(reason: LedgerReason, delta: number, refId: string, key?: string) {
      const r = await credit(exec, userId, delta, reason, refId, { now });
      balance = r.balance;
      if (r.paid) lines.push({ reason, delta, ...(key && { key }) });
    },
    reward(note: WinNote | null, unlocked: string[]): Reward {
      const total = lines.reduce((sum, l) => sum + l.delta, 0);
      return { lines, total, balance, note, unlocked };
    },
  };
}

/** Ledger rows of these kinds for a player since a moment (today's paid wins). */
async function paidSince(exec: Tx | Db, userId: string, reasons: LedgerReason[], since: Date) {
  return exec
    .select({ ref: walletLedger.refId })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.userId, userId),
        inArray(walletLedger.reason, reasons),
        gte(walletLedger.createdAt, since),
      ),
    );
}

/**
 * Pay doubloons for a just-recorded match: the winner's win, skunk and first win of the day (within
 * the fair-play limits), and each player's newly unlocked achievements. The caller has locked both
 * wallets (lockWallets), so today's counts can't change underneath us. Returns what each signed-in
 * player earned.
 */
export async function awardDoubloons(
  tx: Tx | Db,
  game: MatchInfo,
  players: [string | null, string | null],
  state: GameState,
  forfeitedBy: Seat | null,
  unlocked: Map<string, string[]>,
  now = new Date(),
): Promise<Map<string, Reward>> {
  const rewards = new Map<string, Reward>();
  const forfeited = forfeitedBy !== null;
  const durationMs = now.getTime() - game.createdAt.getTime();
  const dayStart = utcDayStart(now);
  for (const seat of [0, 1] as Seat[]) {
    const userId = players[seat];
    if (!userId) continue;
    const wallet = payer(tx, userId, await balanceOf(tx, userId), now);
    let note: WinNote | null = null;

    if (state.winner === seat) {
      const kind = game.mode === "ai" ? "bot" : game.ranked ? "ranked" : "online";
      let paidBotWinsToday = 0;
      let paidOnlineWinsToday = 0;
      let paidWinsVsOpponentToday = 0;
      if (kind === "bot") {
        paidBotWinsToday = (await paidSince(tx, userId, ["botWin"], dayStart)).length;
      } else {
        // Today's paid online wins, then how many of those matches were against this opponent.
        const ids = (await paidSince(tx, userId, ["onlineWin", "rankedWin"], dayStart)).map(
          (r) => r.ref,
        );
        paidOnlineWinsToday = ids.length;
        const opponent = players[other(seat)];
        if (ids.length && opponent) {
          const [row] = await tx
            .select({ n: count() })
            .from(matchPlayers)
            .where(and(eq(matchPlayers.userId, opponent), inArray(matchPlayers.matchId, ids)));
          paidWinsVsOpponentToday = row?.n ?? 0;
        }
      }
      const p = winPayout({
        kind,
        level: game.aiLevel,
        state,
        forfeited,
        durationMs,
        paidBotWinsToday,
        paidOnlineWinsToday,
        paidWinsVsOpponentToday,
      });
      note = p.note;
      if (p.win > 0) {
        await wallet.pay(p.reason, p.win, game.id);
        if (p.skunk > 0) await wallet.pay("skunk", p.skunk, game.id, p.skunkKey);
        // Pays once a day (the day is the ref); later wins today find it already paid.
        await wallet.pay("firstWinOfDay", FIRST_WIN_OF_DAY, utcDay(now));
      }
    }

    // Win-based achievements pay only for a game long enough to pay (awardAchievements doesn't
    // unlock them otherwise, so this is a safety net); the rest always do.
    const long = longEnough(state, forfeited, durationMs);
    const keys = unlocked.get(userId) ?? [];
    for (const key of keys) {
      const amount = achievementPayout(key, long);
      if (amount > 0) await wallet.pay("achievement", amount, key, key);
    }
    rewards.set(userId, wallet.reward(note, keys));
  }
  return rewards;
}

/** Pay for a daily discard puzzle (once per puzzle day), plus any achievement it unlocked. */
export async function payDaily(
  tx: Tx | Db,
  userId: string,
  day: string,
  best: boolean,
  unlocked: string[],
  now = new Date(),
): Promise<Reward> {
  const wallet = payer(tx, userId, await balanceOf(tx, userId), now);
  await wallet.pay("daily", best ? DAILY_BEST : DAILY_PLAYED, day, best ? "best" : undefined);
  for (const key of unlocked) {
    const amount = achievementPayout(key, true);
    if (amount > 0) await wallet.pay("achievement", amount, key, key);
  }
  return wallet.reward(null, unlocked);
}
