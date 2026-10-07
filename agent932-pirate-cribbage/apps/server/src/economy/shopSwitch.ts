import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema.js";
import type { Tx } from "../games/record.js";

/*
 * The shop switch. Imports only the schema, so the auth, admin and online code can use it without
 * an import cycle.
 */

/** The settings row that opens the shop to players: { "open": boolean }. */
export const SHOP_SETTING = "shop";

/** The switch as saved. `saved` is false while there's no row yet, which means closed. */
export async function shopSwitch(exec: Tx | Db): Promise<{ open: boolean; saved: boolean }> {
  const [row] = await exec
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SHOP_SETTING));
  return { open: (row?.value as { open?: unknown } | undefined)?.open === true, saved: !!row };
}

/**
 * Whether players can see the shop and buy from it (D-32). Admins always can (a preview). A
 * missing row means closed, so a fresh database starts closed.
 */
export async function shopIsOpen(exec: Tx | Db): Promise<boolean> {
  return (await shopSwitch(exec)).open;
}

/** Open or close the shop to players (Admin → Shop). */
export async function saveShopSwitch(exec: Tx | Db, open: boolean) {
  await exec
    .insert(settings)
    .values({ key: SHOP_SETTING, value: { open } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { open }, updatedAt: new Date() } });
}
