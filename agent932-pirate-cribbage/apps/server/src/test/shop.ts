import { expect } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { inventory, settings, walletLedger } from "../db/schema.js";
import { SHOP_SETTING } from "../economy/shopSwitch.js";

/** Open or close the shop to players, as Admin → Shop does. */
export async function setShopOpen(db: Db, open: boolean) {
  await db
    .insert(settings)
    .values({ key: SHOP_SETTING, value: { open } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { open }, updatedAt: new Date() } });
}

/** The item ids in a player's inventory, sorted. */
export async function inventoryOf(db: Db, userId: string) {
  const rows = await db
    .select({ itemId: inventory.itemId })
    .from(inventory)
    .where(eq(inventory.userId, userId));
  return rows.map((r) => r.itemId).sort();
}

/** Every bought item has its purchase row, and every purchase row its item (one player's, or all). */
export async function expectPurchasesMatch(db: Db, userId?: string) {
  const paid = await db
    .select({ userId: walletLedger.userId, itemId: walletLedger.refId })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.reason, "purchase"),
        userId ? eq(walletLedger.userId, userId) : undefined,
      ),
    );
  const owned = await db
    .select({ userId: inventory.userId, itemId: inventory.itemId })
    .from(inventory)
    .where(userId ? eq(inventory.userId, userId) : undefined);
  const key = (r: { userId: string; itemId: string }) => `${r.userId} ${r.itemId}`;
  expect(owned.map(key).sort()).toEqual(paid.map(key).sort());
}
