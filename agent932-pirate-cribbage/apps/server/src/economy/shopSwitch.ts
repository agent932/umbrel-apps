import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema.js";
import type { Tx } from "../games/record.js";

/** The settings row that opens the shop to players: { "open": boolean }. */
export const SHOP_SETTING = "shop";

/**
 * Whether players can see the shop and buy from it (D-32). Admins always can (a preview). A
 * missing row means closed, so a fresh database starts closed. Imports only the schema, so the
 * auth, admin and online code can use it without an import cycle.
 */
export async function shopIsOpen(exec: Tx | Db): Promise<boolean> {
  const [row] = await exec
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SHOP_SETTING));
  return (row?.value as { open?: unknown } | undefined)?.open === true;
}
