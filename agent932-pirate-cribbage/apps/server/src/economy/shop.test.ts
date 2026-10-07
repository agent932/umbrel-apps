import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_COSMETICS, SHOP_ITEMS, type ShopItemDef } from "@pirate/engine";
import { shopItems, users } from "../db/schema.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { expectPurchasesMatch, inventoryOf, setShopOpen } from "../test/shop.js";
import { signUp, testApp } from "../test/testApp.js";
import { credit } from "./wallet.js";

interface Player {
  id: string;
  cookie: string;
  isAdmin: boolean;
}

let t: Awaited<ReturnType<typeof testApp>>;
/** The first account, so an admin. */
let captain: Player;
beforeEach(async () => {
  t = await testApp();
  captain = await player("Captain");
});
afterEach(async () => {
  try {
    await expectLedgerMatches(t.db);
    await expectPurchasesMatch(t.db);
  } finally {
    await t.close();
  }
});

async function player(name: string): Promise<Player> {
  const { res, cookie } = await signUp(t.app, name);
  const { id, isAdmin } = res.json().user;
  return { id, cookie, isAdmin };
}

/** A player who isn't an admin, given some doubloons. */
async function crew(name: string, doubloons = 0) {
  const p = await player(name);
  expect(p.isAdmin).toBe(false);
  if (doubloons) await credit(t.db, p.id, doubloons, "admin", randomUUID());
  return p;
}

const shop = (cookie?: string) =>
  t.app.inject({ url: "/api/shop", headers: cookie ? { cookie } : {} });
const post = (url: string, cookie: string | undefined, payload: object) =>
  t.app.inject({ method: "POST", url, headers: cookie ? { cookie } : {}, payload });
const buy = (p: Player, itemId: string, price: number) =>
  post("/api/shop/buy", p.cookie, { itemId, price });
const use = (p: Player, itemId: string) => post("/api/shop/use", p.cookie, { itemId });

/** What a player's users row says they use. */
async function equippedColumns(id: string) {
  const [row] = await t.db
    .select({ board: users.equippedBoard, deck: users.equippedDeck })
    .from(users)
    .where(eq(users.id, id));
  return row;
}

const byShopOrder = (a: ShopItemDef, b: ShopItemDef) =>
  a.type.localeCompare(b.type) || a.sort - b.sort || a.id.localeCompare(b.id);
/** Every item id, boards then card backs, each by sort. */
const ALL = [...SHOP_ITEMS].sort(byShopOrder).map((i) => i.id);
/** The free items, which everyone owns. */
const FREE = ["board.serpent-reef", "deck.cribbage-logo", "deck.moon-compass"];
const ids = (items: { id: string }[]) => items.map((i) => i.id);

/** An item as GET /api/shop shows it. */
function shown(id: string) {
  const { sort: _sort, ...item } = SHOP_ITEMS.find((i) => i.id === id)!;
  return { ...item, available: true };
}

describe("the catalog", () => {
  it("is the engine's list, every item on sale", async () => {
    const pick = ({ id, type, name, description, price, isDefault, sort }: ShopItemDef) => ({
      id,
      type,
      name,
      description,
      price,
      isDefault,
      sort,
    });
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    const rows = await t.db.select().from(shopItems);
    expect(rows.map(pick).sort(byId)).toEqual(SHOP_ITEMS.map(pick).sort(byId));
    expect(rows.every((r) => r.available)).toBe(true);
    expect(FREE).toEqual(ALL.filter((id) => SHOP_ITEMS.find((i) => i.id === id)!.price === 0));
  });
});

describe("GET /api/shop", () => {
  it("while closed: nothing for guests, only what they own for players, all of it for admins", async () => {
    const anne = await crew("Anne", 700);
    expect((await shop()).json()).toEqual({ open: false, items: [] });

    const mine = (await shop(anne.cookie)).json();
    expect(mine).toEqual({
      open: false,
      items: FREE.map(shown),
      owned: FREE,
      equipped: DEFAULT_COSMETICS,
    });

    const preview = (await shop(captain.cookie)).json();
    expect(preview).toEqual({
      open: false,
      preview: true,
      items: ALL.map(shown),
      doubloons: 0,
      owned: FREE,
      equipped: DEFAULT_COSMETICS,
    });
  });

  it("once open: every item for guests too, and a player's doubloons, items and choices", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 700);
    expect((await shop()).json()).toEqual({ open: true, items: ALL.map(shown) });
    expect((await shop(anne.cookie)).json()).toEqual({
      open: true,
      items: ALL.map(shown),
      doubloons: 700,
      owned: FREE,
      equipped: DEFAULT_COSMETICS,
    });
    expect((await shop(captain.cookie)).json()).not.toHaveProperty("preview");
  });

  it("hides an item taken off sale, except from the players who own it", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 1500);
    const bonny = await crew("Bonny");
    expect((await buy(anne, "board.treasure-map", 1500)).statusCode).toBe(200);
    await t.db
      .update(shopItems)
      .set({ available: false })
      .where(eq(shopItems.id, "board.treasure-map"));
    const forSale = ALL.filter((id) => id !== "board.treasure-map");
    expect(ids((await shop()).json().items)).toEqual(forSale);
    expect(ids((await shop(bonny.cookie)).json().items)).toEqual(forSale);
    const mine = (await shop(anne.cookie)).json();
    expect(ids(mine.items)).toEqual(ALL);
    expect(mine.items[1]).toEqual({ ...shown("board.treasure-map"), available: false });
  });
});

describe("POST /api/shop/buy", () => {
  it("is for admins only while the shop is closed", async () => {
    const anne = await crew("Anne", 2000);
    await credit(t.db, captain.id, 2000, "admin", randomUUID());
    const refused = await buy(anne, "board.treasure-map", 1500);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: "The shop isn't open yet", code: "closed" });
    expect(await ledgerRows(t.db, anne.id, "purchase")).toEqual([]);
    expect(await inventoryOf(t.db, anne.id)).toEqual([]);
    expect(await doubloonsOf(t.db, anne.id)).toBe(2000);

    expect((await buy(captain, "board.treasure-map", 1500)).statusCode).toBe(200);
    expect(await inventoryOf(t.db, captain.id)).toEqual(["board.treasure-map"]);
  });

  it("charges the price and adds the item, without switching it on", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 2500);
    const res = await buy(anne, "board.treasure-map", 1500);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      doubloons: 1000,
      owned: [
        "board.serpent-reef",
        "board.treasure-map",
        "deck.cribbage-logo",
        "deck.moon-compass",
      ],
    });
    expect(await doubloonsOf(t.db, anne.id)).toBe(1000);
    expect(await ledgerRows(t.db, anne.id, "purchase")).toMatchObject([
      { delta: -1500, refId: "board.treasure-map", note: null, actorId: null },
    ]);
    expect(await inventoryOf(t.db, anne.id)).toEqual(["board.treasure-map"]);
    expect(await equippedColumns(anne.id)).toEqual({ board: null, deck: null });
    expect((await shop(anne.cookie)).json()).toMatchObject({
      doubloons: 1000,
      owned: res.json().owned,
      equipped: DEFAULT_COSMETICS,
    });
  });

  it("refuses a price that isn't the database's, and charges the database's", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 2000);
    await t.db.update(shopItems).set({ price: 1234 }).where(eq(shopItems.id, "board.treasure-map"));
    for (const price of [1500, 1]) {
      const res = await buy(anne, "board.treasure-map", price);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        error: "Treasure Map now costs 1,234 doubloons",
        code: "priceChanged",
        price: 1234,
      });
    }
    for (const price of [undefined, -1, 1.5, "1234", 1_000_001]) {
      const res = await post("/api/shop/buy", anne.cookie, { itemId: "board.treasure-map", price });
      expect(res.statusCode, String(price)).toBe(400);
    }
    expect(await ledgerRows(t.db, anne.id, "purchase")).toEqual([]);
    expect(await inventoryOf(t.db, anne.id)).toEqual([]);

    const res = await buy(anne, "board.treasure-map", 1234);
    expect(res.statusCode).toBe(200);
    expect(res.json().doubloons).toBe(766);
    expect(await ledgerRows(t.db, anne.id, "purchase")).toMatchObject([{ delta: -1234 }]);
  });

  it("won't sell you what you already have, free items included", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 3000);
    expect((await buy(anne, "board.treasure-map", 1500)).statusCode).toBe(200);
    const again = await buy(anne, "board.treasure-map", 1500);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "You already have Treasure Map", code: "owned" });
    for (const itemId of FREE) {
      const res = await buy(anne, itemId, 0);
      expect(res.statusCode, itemId).toBe(409);
      expect(res.json().code).toBe("owned");
    }
    expect(await doubloonsOf(t.db, anne.id)).toBe(1500);
    expect(await ledgerRows(t.db, anne.id, "purchase")).toHaveLength(1);
    expect(await inventoryOf(t.db, anne.id)).toEqual(["board.treasure-map"]);
  });

  it("turns away unknown items, items off sale, bad requests and guests", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 5000);
    const unknown = await buy(anne, "board.nope", 1500);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "That item isn't in the shop", code: "unknown" });
    // The longest id the API takes is 64 characters.
    expect((await buy(anne, `board.${"x".repeat(58)}`, 1500)).statusCode).toBe(404);
    await t.db.update(shopItems).set({ available: false }).where(eq(shopItems.id, "deck.ghost"));
    expect((await buy(anne, "deck.ghost", 1000)).statusCode).toBe(404);

    for (const payload of [
      { itemId: "Board.Treasure-Map", price: 1500 },
      { itemId: "pegs.gold", price: 1500 },
      { itemId: "board.", price: 1500 },
      { itemId: "treasure-map", price: 1500 },
      { price: 1500 },
      { itemId: 7, price: 1500 },
      { itemId: `board.${"x".repeat(59)}`, price: 1500 },
    ]) {
      const res = await post("/api/shop/buy", anne.cookie, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    const guest = await post("/api/shop/buy", undefined, {
      itemId: "board.treasure-map",
      price: 1500,
    });
    expect(guest.statusCode).toBe(401);
    expect(await ledgerRows(t.db, anne.id, "purchase")).toEqual([]);
    expect(await doubloonsOf(t.db, anne.id)).toBe(5000);
  });

  it("needs the whole price", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 1499);
    const short = await buy(anne, "board.treasure-map", 1500);
    expect(short.statusCode).toBe(409);
    expect(short.json()).toEqual({
      error: "Treasure Map costs 1,500 doubloons and you have 1,499",
      code: "short",
    });
    expect(await ledgerRows(t.db, anne.id, "purchase")).toEqual([]);
    expect(await inventoryOf(t.db, anne.id)).toEqual([]);

    await credit(t.db, anne.id, 1, "admin", randomUUID());
    const exact = await buy(anne, "board.treasure-map", 1500);
    expect(exact.statusCode).toBe(200);
    expect(exact.json().doubloons).toBe(0);
  });

  it("charges once when the same item is bought three times at once (one at a time on PGlite)", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 5000);
    const all = await Promise.all([1, 2, 3].map(() => buy(anne, "deck.crimson", 1000)));
    expect(all.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    expect(all.filter((r) => r.statusCode === 409).map((r) => r.json().code)).toEqual([
      "owned",
      "owned",
    ]);
    expect(await ledgerRows(t.db, anne.id, "purchase")).toHaveLength(1);
    expect(await inventoryOf(t.db, anne.id)).toEqual(["deck.crimson"]);
    expect(await doubloonsOf(t.db, anne.id)).toBe(4000);
  });

  it("sells only one of two items that together cost more than you have", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 2000);
    const both = await Promise.all([
      buy(anne, "board.treasure-map", 1500),
      buy(anne, "deck.crimson", 1000),
    ]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(both.find((r) => r.statusCode === 409)!.json().code).toBe("short");
    expect(await inventoryOf(t.db, anne.id)).toHaveLength(1);
    expect(await doubloonsOf(t.db, anne.id)).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /api/shop/use", () => {
  it("uses an item you own, and nothing you don't", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 1500);
    const notYet = await use(anne, "board.treasure-map");
    expect(notYet.statusCode).toBe(409);
    expect(notYet.json()).toEqual({ error: "Buy Treasure Map first", code: "notOwned" });
    expect(await equippedColumns(anne.id)).toEqual({ board: null, deck: null });

    expect((await buy(anne, "board.treasure-map", 1500)).statusCode).toBe(200);
    const res = await use(anne, "board.treasure-map");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      equipped: { board: "board.treasure-map", deck: DEFAULT_COSMETICS.deck },
    });
    expect(await equippedColumns(anne.id)).toEqual({ board: "board.treasure-map", deck: null });
    expect((await shop(anne.cookie)).json().equipped).toEqual(res.json().equipped);
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie: anne.cookie } });
    expect(me.json().user).toMatchObject({
      equippedBoard: "board.treasure-map",
      equippedDeck: null,
    });
    // Using costs nothing.
    expect(await doubloonsOf(t.db, anne.id)).toBe(0);
  });

  it("stores null for a default and the id for a free extra; a back changes only the back", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 1500);
    await buy(anne, "board.treasure-map", 1500);
    await use(anne, "board.treasure-map");

    const extra = await use(anne, "deck.moon-compass");
    expect(extra.json()).toEqual({
      equipped: { board: "board.treasure-map", deck: "deck.moon-compass" },
    });
    expect(await equippedColumns(anne.id)).toEqual({
      board: "board.treasure-map",
      deck: "deck.moon-compass",
    });

    expect((await use(anne, "board.serpent-reef")).json()).toEqual({
      equipped: { board: "board.serpent-reef", deck: "deck.moon-compass" },
    });
    expect(await equippedColumns(anne.id)).toEqual({ board: null, deck: "deck.moon-compass" });
    expect((await use(anne, "deck.cribbage-logo")).json()).toEqual({ equipped: DEFAULT_COSMETICS });
    expect(await equippedColumns(anne.id)).toEqual({ board: null, deck: null });
  });

  it("works while the shop is closed, and for an item taken off sale", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 1000);
    expect((await buy(anne, "deck.crimson", 1000)).statusCode).toBe(200);
    await setShopOpen(t.db, false);

    const closed = (await shop(anne.cookie)).json();
    expect(closed).toMatchObject({
      open: false,
      owned: [...FREE, "deck.crimson"],
      equipped: DEFAULT_COSMETICS,
    });
    expect(ids(closed.items)).toEqual([...FREE, "deck.crimson"]);
    expect((await use(anne, "deck.crimson")).statusCode).toBe(200);

    await t.db.update(shopItems).set({ available: false }).where(eq(shopItems.id, "deck.crimson"));
    expect((await use(anne, "deck.moon-compass")).statusCode).toBe(200);
    expect((await use(anne, "deck.crimson")).json()).toEqual({
      equipped: { board: DEFAULT_COSMETICS.board, deck: "deck.crimson" },
    });
    expect(ids((await shop(anne.cookie)).json().items)).toContain("deck.crimson");
  });

  it("turns away unknown items, bad requests and guests", async () => {
    const anne = await crew("Anne");
    const unknown = await use(anne, "deck.nope");
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "That item isn't in the shop", code: "unknown" });
    for (const payload of [{ itemId: "Deck.Crimson" }, { itemId: "pegs.gold" }, {}]) {
      expect((await post("/api/shop/use", anne.cookie, payload)).statusCode).toBe(400);
    }
    expect((await post("/api/shop/use", undefined, { itemId: "deck.crimson" })).statusCode).toBe(
      401,
    );
    expect(await equippedColumns(anne.id)).toEqual({ board: null, deck: null });
  });
});

describe("deleting an account", () => {
  it("takes its items and purchase rows, and nobody else's", async () => {
    await setShopOpen(t.db, true);
    const anne = await crew("Anne", 2500);
    const bonny = await crew("Bonny", 1500);
    const catalog = await t.db.select().from(shopItems);
    expect((await buy(anne, "board.treasure-map", 1500)).statusCode).toBe(200);
    expect((await buy(anne, "deck.crimson", 1000)).statusCode).toBe(200);
    expect((await use(anne, "board.treasure-map")).statusCode).toBe(200);
    expect((await buy(bonny, "board.treasure-map", 1500)).statusCode).toBe(200);

    const res = await post("/api/auth/delete", anne.cookie, { password: "parrots-and-rum" });
    expect(res.statusCode).toBe(200);
    expect(await inventoryOf(t.db, anne.id)).toEqual([]);
    expect(await ledgerRows(t.db, anne.id)).toEqual([]);
    expect(await t.db.select().from(shopItems)).toEqual(catalog);
    expect(await inventoryOf(t.db, bonny.id)).toEqual(["board.treasure-map"]);
    expect(await ledgerRows(t.db, bonny.id, "purchase")).toHaveLength(1);
  });
});
