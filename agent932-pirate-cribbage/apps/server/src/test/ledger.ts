import { expect } from "vitest";
import { and, asc, eq, sum } from "drizzle-orm";
import type { LedgerReason } from "@pirate/engine";
import type { Db } from "../db/client.js";
import { users, walletLedger } from "../db/schema.js";

/** Every player's doubloons equal the sum of their ledger rows. */
export async function expectLedgerMatches(db: Db) {
  const rows = await db
    .select({
      username: users.username,
      doubloons: users.doubloons,
      total: sum(walletLedger.delta).mapWith(Number),
    })
    .from(users)
    .leftJoin(walletLedger, eq(walletLedger.userId, users.id))
    .groupBy(users.id);
  for (const r of rows) expect(r.doubloons, r.username).toBe(r.total ?? 0);
}

/** A player's ledger rows, optionally of one kind, oldest first. */
export function ledgerRows(db: Db, userId: string, reason?: LedgerReason) {
  return db
    .select()
    .from(walletLedger)
    .where(
      and(eq(walletLedger.userId, userId), reason ? eq(walletLedger.reason, reason) : undefined),
    )
    .orderBy(asc(walletLedger.createdAt));
}

/** A player's doubloons, straight from the database. */
export async function doubloonsOf(db: Db, userId: string) {
  const [row] = await db
    .select({ doubloons: users.doubloons })
    .from(users)
    .where(eq(users.id, userId));
  return row?.doubloons;
}
