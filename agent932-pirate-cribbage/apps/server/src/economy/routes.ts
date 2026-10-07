import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, gte } from "drizzle-orm";
import {
  BOT_WIN_CAP,
  type LedgerReason,
  ONLINE_WIN_CAP,
  nextDailyReset,
  utcDay,
  utcDayStart,
} from "@pirate/engine";
import { requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { walletLedger } from "../db/schema.js";
import { balanceOf } from "./wallet.js";

/** How many recent ledger rows a player sees. */
const RECENT_ROWS = 20;

export async function economyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /** Your doubloons, how today's limits stand, and your latest earnings. */
  app.get("/api/wallet", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const now = new Date();
    const today = await db
      .select({ reason: walletLedger.reason, n: count() })
      .from(walletLedger)
      .where(and(eq(walletLedger.userId, user.id), gte(walletLedger.createdAt, utcDayStart(now))))
      .groupBy(walletLedger.reason);
    const paidToday = (...reasons: LedgerReason[]) =>
      today.filter((r) => reasons.includes(r.reason)).reduce((sum, r) => sum + r.n, 0);
    const recent = await db
      .select({
        delta: walletLedger.delta,
        reason: walletLedger.reason,
        ref: walletLedger.refId,
        createdAt: walletLedger.createdAt,
      })
      .from(walletLedger)
      .where(eq(walletLedger.userId, user.id))
      .orderBy(desc(walletLedger.createdAt), desc(walletLedger.id))
      .limit(RECENT_ROWS);
    return {
      doubloons: await balanceOf(db, user.id),
      today: {
        day: utcDay(now),
        resetsAt: nextDailyReset(now).toISOString(),
        botWinsPaid: paidToday("botWin"),
        botWinCap: BOT_WIN_CAP,
        onlineWinsPaid: paidToday("onlineWin", "rankedWin"),
        onlineWinCap: ONLINE_WIN_CAP,
        firstWinOfDayPaid: paidToday("firstWinOfDay") > 0,
      },
      // Admin rows keep their reference (and their note and who made them) to Admin.
      recent: recent.map((r) => ({ ...r, ref: r.reason === "admin" ? null : r.ref })),
    };
  });
}
