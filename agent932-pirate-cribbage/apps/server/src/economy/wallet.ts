import { and, eq, inArray, sql } from "drizzle-orm";
import type { LedgerReason } from "@pirate/engine";
import type { Db } from "../db/client.js";
import { users, walletLedger } from "../db/schema.js";
import type { Tx } from "../games/record.js";

/** A change would take a player's doubloons below zero. */
export class OverdrawError extends Error {}

export interface CreditOpts {
  /** Admin rows: why. */
  note?: string;
  /** Admin rows: who made the change. */
  actorId?: string;
  /** When it happened (defaults to now). Set from the server's clock, never the database's. */
  now?: Date;
}

/**
 * Lock these players' wallets for the rest of the transaction, always in id order so two
 * transactions can't deadlock. Every transaction that pays doubloons calls this before counting
 * today's payouts or writing anything that refers to the players, so a count can't go stale
 * before the payout lands. Null ids (the computer) are skipped.
 */
export async function lockWallets(
  exec: Tx | Db,
  ids: (string | null)[],
): Promise<{ id: string; username: string; doubloons: number }[]> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return [];
  // "No key update" still lets other transactions add rows that refer to these players.
  return exec
    .select({ id: users.id, username: users.username, doubloons: users.doubloons })
    .from(users)
    .where(inArray(users.id, wanted))
    .orderBy(users.id)
    .for("no key update");
}

export async function balanceOf(exec: Tx | Db, userId: string): Promise<number> {
  const [row] = await exec
    .select({ doubloons: users.doubloons })
    .from(users)
    .where(eq(users.id, userId));
  return row?.doubloons ?? 0;
}

/**
 * Add (or, for admins, remove) doubloons, with a ledger row saying why. The only code that writes
 * the ledger or a balance. An event that already paid (same player, reason and ref) pays nothing
 * again. Throws OverdrawError rather than going below zero. The insert and the balance change
 * run in their own savepoint, so a failure never leaves one without the other.
 */
export async function credit(
  exec: Tx | Db,
  userId: string,
  delta: number,
  reason: LedgerReason,
  refId: string,
  opts: CreditOpts = {},
): Promise<{ paid: boolean; balance: number }> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error("bad delta");
  return exec.transaction(async (sp) => {
    const [row] = await sp
      .insert(walletLedger)
      .values({
        userId,
        delta,
        reason,
        refId,
        note: opts.note ?? null,
        actorId: opts.actorId ?? null,
        createdAt: opts.now ?? new Date(),
      })
      .onConflictDoNothing({
        target: [walletLedger.userId, walletLedger.reason, walletLedger.refId],
      })
      .returning({ id: walletLedger.id });
    if (!row) return { paid: false, balance: await balanceOf(sp, userId) };
    const [after] = await sp
      .update(users)
      .set({ doubloons: sql`${users.doubloons} + ${delta}` })
      .where(and(eq(users.id, userId), sql`${users.doubloons} + ${delta} >= 0`))
      .returning({ doubloons: users.doubloons });
    if (!after) throw new OverdrawError();
    return { paid: true, balance: after.doubloons };
  });
}
