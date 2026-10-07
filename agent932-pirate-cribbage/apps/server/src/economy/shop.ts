import type { FastifyInstance } from "fastify";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { type Cosmetics, DEFAULT_COSMETICS, itemType } from "@pirate/engine";
import { parseBody, requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { inventory, shopItems, users } from "../db/schema.js";
import type { Tx } from "../games/record.js";
import { shopIsOpen } from "./shopSwitch.js";
import { OverdrawError, credit, lockWallets } from "./wallet.js";

/*
 * The shop: boards and card backs bought with doubloons. Only credit() changes a balance. Every
 * inventory insert is here, after lockWallets(tx, [userId]) in the same transaction, and nothing
 * ever changes or deletes an inventory row: they go only with the account.
 */

/** "board.treasure-map": a known item type, a dot, then lower-case letters, digits and dashes. */
const ItemId = z
  .string()
  .trim()
  .max(64, "Pick an item")
  .refine((id) => itemType(id) !== null, "Pick an item");
/** `price` is what the player was shown: the server refuses a different one (it still charges its own). */
const BuyBody = z.object({ itemId: ItemId, price: z.number().int().min(0).max(1_000_000) });
const UseBody = z.object({ itemId: ItemId });

/** What the browser gets to see of an item. */
const itemColumns = {
  id: shopItems.id,
  type: shopItems.type,
  name: shopItems.name,
  description: shopItems.description,
  price: shopItems.price,
  isDefault: shopItems.isDefault,
  available: shopItems.available,
};

/** Shop order: boards, then card backs, each by sort, then id. */
export const shopOrder = [asc(shopItems.type), asc(shopItems.sort), asc(shopItems.id)];

/** 1500 → "1,500". */
const amount = (n: number) => n.toLocaleString("en-US");

/** Whether the player has an inventory row for this item (free items have none). */
async function hasBought(exec: Tx | Db, userId: string, itemId: string) {
  const [row] = await exec
    .select({ itemId: inventory.itemId })
    .from(inventory)
    .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
  return !!row;
}

/** Free items (price 0) plus inventory, as item ids, in shop order. */
export async function ownedItems(exec: Tx | Db, userId: string): Promise<string[]> {
  const rows = await exec
    .select({ id: shopItems.id })
    .from(shopItems)
    .leftJoin(inventory, and(eq(inventory.itemId, shopItems.id), eq(inventory.userId, userId)))
    .where(or(eq(shopItems.price, 0), isNotNull(inventory.userId)))
    .orderBy(...shopOrder);
  return rows.map((r) => r.id);
}

/** A user's equipped columns with defaults filled in. */
export function equippedOf(u: {
  equippedBoard: string | null;
  equippedDeck: string | null;
}): Cosmetics {
  return {
    board: u.equippedBoard ?? DEFAULT_COSMETICS.board,
    deck: u.equippedDeck ?? DEFAULT_COSMETICS.deck,
  };
}

export async function shopRoutes(app: FastifyInstance, { db }: { db: Db }) {
  /**
   * The items, with what you own and use. While the shop is closed, admins see all of it (a
   * preview), players see only what they own (so they can still switch), and guests see nothing.
   */
  app.get("/api/shop", async (req, reply) => {
    const user = req.user;
    const open = await shopIsOpen(db);
    const visible = open || !!user?.isAdmin;
    const items = await db
      .select(itemColumns)
      .from(shopItems)
      .orderBy(...shopOrder);
    if (!user) return { open, items: visible ? items.filter((i) => i.available) : [] };
    const [me] = await db
      .select({
        doubloons: users.doubloons,
        equippedBoard: users.equippedBoard,
        equippedDeck: users.equippedDeck,
      })
      .from(users)
      .where(eq(users.id, user.id));
    if (!me) return reply.code(401).send({ error: "Sign in first" });
    const owned = await ownedItems(db, user.id);
    const mine = new Set(owned);
    const equipped = equippedOf(me);
    if (!visible) return { open, items: items.filter((i) => mine.has(i.id)), owned, equipped };
    return {
      open,
      ...(!open && { preview: true }),
      // An item taken off sale still shows to the players who own it.
      items: items.filter((i) => i.available || mine.has(i.id)),
      doubloons: me.doubloons,
      owned,
      equipped,
    };
  });

  /** Buy an item at the price you were shown. It doesn't switch the item on. */
  app.post("/api/shop/buy", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(BuyBody, req.body, reply);
    if (!body) return;
    if (!user.isAdmin && !(await shopIsOpen(db)))
      return reply.code(403).send({ error: "The shop isn't open yet", code: "closed" });
    const out = await db
      .transaction(async (tx) => {
        // First, always: a buy waits for any payout, adjustment or other buy for this player.
        const [me] = await lockWallets(tx, [user.id]);
        if (!me) return { kind: "gone" } as const;
        const [item] = await tx.select().from(shopItems).where(eq(shopItems.id, body.itemId));
        if (!item || !item.available) return { kind: "unknown" } as const;
        // Free items are everyone's already.
        if (item.price === 0) return { kind: "owned", item } as const;
        if (await hasBought(tx, user.id, item.id)) return { kind: "owned", item } as const;
        if (body.price !== item.price) return { kind: "priceChanged", item } as const;
        if (me.doubloons < item.price) return { kind: "short", item, have: me.doubloons } as const;
        // Grant first: if the row is already there, nothing has been charged.
        const [added] = await tx
          .insert(inventory)
          .values({ userId: user.id, itemId: item.id })
          .onConflictDoNothing()
          .returning({ itemId: inventory.itemId });
        if (!added) return { kind: "owned", item } as const;
        const { paid, balance } = await credit(tx, user.id, -item.price, "purchase", item.id);
        // Not paid: they were charged for this item before but had no inventory row, so it's given
        // back for free. Inventory rows only go with the account, so this should never happen.
        if (!paid) req.log.error({ userId: user.id, itemId: item.id }, "restored a paid-for item");
        return { kind: "bought", balance, owned: await ownedItems(tx, user.id) } as const;
      })
      .catch((err: unknown) => {
        // credit()'s own guard, which the balance check makes unreachable. Its throw rolled back
        // the inventory row too.
        if (err instanceof OverdrawError) return { kind: "overdrawn" } as const;
        throw err;
      });
    switch (out.kind) {
      case "bought":
        return { doubloons: out.balance, owned: out.owned };
      case "gone":
        return reply.code(401).send({ error: "Sign in first" });
      case "unknown":
        return reply.code(404).send({ error: "That item isn't in the shop", code: "unknown" });
      case "owned":
        return reply.code(409).send({ error: `You already have ${out.item.name}`, code: "owned" });
      case "priceChanged":
        return reply.code(409).send({
          error: `${out.item.name} now costs ${amount(out.item.price)} doubloons`,
          code: "priceChanged",
          price: out.item.price,
        });
      case "short":
        return reply.code(409).send({
          error: `${out.item.name} costs ${amount(out.item.price)} doubloons and you have ${amount(out.have)}`,
          code: "short",
        });
      case "overdrawn":
        return reply.code(409).send({ error: "You don't have enough doubloons", code: "short" });
    }
  });

  /**
   * Use a board or card back you own. Allowed whether the shop is open or not, and for items
   * taken off sale. A game already going keeps what it started with.
   */
  app.post("/api/shop/use", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = parseBody(UseBody, req.body, reply);
    if (!body) return;
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, body.itemId));
    if (!item)
      return reply.code(404).send({ error: "That item isn't in the shop", code: "unknown" });
    // No wallet lock: doubloons aren't touched, and an inventory row never goes away.
    if (item.price !== 0 && !(await hasBought(db, user.id, item.id)))
      return reply.code(409).send({ error: `Buy ${item.name} first`, code: "notOwned" });
    // The default is stored as null.
    const choice = item.isDefault ? null : item.id;
    const [row] = await db
      .update(users)
      .set(item.type === "board" ? { equippedBoard: choice } : { equippedDeck: choice })
      .where(eq(users.id, user.id))
      .returning({ equippedBoard: users.equippedBoard, equippedDeck: users.equippedDeck });
    if (!row) return reply.code(401).send({ error: "Sign in first" });
    return { equipped: equippedOf(row) };
  });
}
