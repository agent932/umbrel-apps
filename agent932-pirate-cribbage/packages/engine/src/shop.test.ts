import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BOARD_PRICE,
  DECK_PRICE,
  DEFAULT_COSMETICS,
  ITEM_TYPES,
  type LedgerReason,
  SHOP_ITEMS,
  itemType,
  shopItemName,
} from "./index.js";

describe("the shop catalog", () => {
  it("has unique ids in the item id format, each starting with its type", () => {
    const ids = SHOP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of SHOP_ITEMS) {
      expect(item.id).toMatch(/^(board|deck)\.[a-z0-9-]+$/);
      expect(item.id.startsWith(`${item.type}.`), item.id).toBe(true);
      expect(ITEM_TYPES).toContain(item.type);
    }
  });

  it("has exactly one free default of each type", () => {
    for (const type of ITEM_TYPES) {
      const defaults = SHOP_ITEMS.filter((i) => i.type === type && i.isDefault);
      expect(defaults, type).toHaveLength(1);
      expect(defaults[0]!.price).toBe(0);
    }
  });

  it("prices every other item at 0 or its type's price", () => {
    const price = { board: BOARD_PRICE, deck: DECK_PRICE };
    for (const item of SHOP_ITEMS.filter((i) => !i.isDefault)) {
      expect([0, price[item.type]], item.id).toContain(item.price);
    }
    expect({ BOARD_PRICE, DECK_PRICE }).toEqual({ BOARD_PRICE: 1500, DECK_PRICE: 1000 });
  });

  it("names and describes every item", () => {
    for (const item of SHOP_ITEMS) {
      expect(item.name.trim(), item.id).not.toBe("");
      expect(item.description.trim(), item.id).not.toBe("");
    }
  });

  it("sells the decided items: four boards, four backs, and three free ones", () => {
    expect(SHOP_ITEMS.map((i) => [i.id, i.price])).toEqual([
      ["board.serpent-reef", 0],
      ["board.treasure-map", 1500],
      ["board.krakens-reef", 1500],
      ["board.ghost-ship", 1500],
      ["board.royal-navy", 1500],
      ["deck.cribbage-logo", 0],
      ["deck.moon-compass", 0],
      ["deck.ships-wheel", 1000],
      ["deck.crimson", 1000],
      ["deck.treasure", 1000],
      ["deck.ghost", 1000],
    ]);
  });
});

describe("DEFAULT_COSMETICS", () => {
  it("names the two defaults: Serpent Reef and the Pirate Cribbage back", () => {
    const def = (type: string) => SHOP_ITEMS.find((i) => i.type === type && i.isDefault)?.id;
    expect(DEFAULT_COSMETICS).toEqual({ board: def("board"), deck: def("deck") });
    expect(DEFAULT_COSMETICS).toEqual({ board: "board.serpent-reef", deck: "deck.cribbage-logo" });
  });
});

describe("itemType", () => {
  it("reads the type from an item id, known to this build or not", () => {
    expect(itemType("board.treasure-map")).toBe("board");
    expect(itemType("deck.crimson")).toBe("deck");
    expect(itemType("board.not-yet-made")).toBe("board");
    expect(itemType("deck.2")).toBe("deck");
  });

  it("is null for an unknown type or a malformed id", () => {
    for (const id of [
      "",
      "board",
      "board.",
      ".treasure-map",
      "board.Treasure-Map",
      "board.treasure map",
      "board.treasure.map",
      " board.treasure-map",
      "pegs.gold",
      "Board.treasure-map",
      "boards.treasure-map",
      "treasure-map",
    ]) {
      expect(itemType(id), JSON.stringify(id)).toBeNull();
    }
  });
});

describe("shopItemName", () => {
  it("names a known item", () => {
    expect(shopItemName("board.treasure-map")).toBe("Treasure Map");
    expect(shopItemName("board.krakens-reef")).toBe("Kraken's Reef");
    expect(shopItemName("deck.ships-wheel")).toBe("Ship's Wheel");
    expect(shopItemName("deck.cribbage-logo")).toBe("Pirate Cribbage");
  });

  it("is null for an item this build doesn't know, or a malformed id", () => {
    expect(shopItemName("board.not-yet-made")).toBeNull();
    expect(shopItemName("pegs.gold")).toBeNull();
    expect(shopItemName("treasure-map")).toBeNull();
    expect(shopItemName("Board.Treasure-Map")).toBeNull();
    expect(shopItemName("")).toBeNull();
  });
});

describe("the purchase ledger reason", () => {
  it("is a LedgerReason", () => {
    expectTypeOf<"purchase">().toExtend<LedgerReason>();
    const reason: LedgerReason = "purchase";
    expect(reason).toBe("purchase");
  });
});
