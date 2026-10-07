import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COSMETICS, SHOP_ITEMS, itemType } from "@pirate/engine";
import {
  DEFAULT_DECK_SKIN,
  deckSkinErrors,
  getDeckSkin,
  listDecks,
  resolveDeck,
} from "./deckSkins.js";
import { PIRATE_PORTRAITS } from "./faceStyles.js";

/** A bundled WebP's size in pixels, read from its VP8X header (the canvas size minus one). */
function webpSize(url: string): [number, number] {
  const bytes = readFileSync(resolve(__dirname, "../assets/table", url.split("/").pop()!));
  expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
  return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
}

describe("card backs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the Pirate Cribbage logo back is the default, and Moon and Compass is still there", () => {
    expect(DEFAULT_DECK_SKIN).toBe("cribbage-logo");
    expect(`deck.${DEFAULT_DECK_SKIN}`).toBe(DEFAULT_COSMETICS.deck);
    expect(getDeckSkin().name).toBe("Pirate Cribbage");
    expect(getDeckSkin().backUrl).toMatch(/card-back-logo/);
    // Today's back, for anyone who prefers it.
    expect(getDeckSkin("deck.moon-compass").backUrl).toMatch(/card-back\.webp/);
  });

  it("draws every back in the shop, by its shop name", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const backs = SHOP_ITEMS.filter((item) => item.type === "deck");
    expect(backs.length).toBeGreaterThan(1);
    for (const item of backs) {
      const { skin, fallback } = resolveDeck(item.id);
      expect(fallback).toBe(false);
      expect(skin.name).toBe(item.name);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it("every back has its art at the card's size and a field colour to paint under it", () => {
    const decks = listDecks();
    expect(decks.map((d) => d.key)).toEqual([
      "deck.cribbage-logo",
      "deck.moon-compass",
      "deck.ships-wheel",
      "deck.crimson",
      "deck.treasure",
      "deck.ghost",
    ]);
    for (const { key, skin } of decks) {
      expect(itemType(key)).toBe("deck");
      expect(key).toBe(`deck.${skin.id}`);
      expect(deckSkinErrors(skin)).toEqual([]);
      expect(skin.backColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(webpSize(skin.backUrl)).toEqual([268, 420]);
    }
    // One file per back: a face-down card never shows another back's art.
    expect(new Set(decks.map((d) => d.skin.backUrl)).size).toBe(decks.length);
  });

  it("finds a back by item id or by skin id", () => {
    expect(resolveDeck("deck.crimson")).toEqual({ skin: getDeckSkin("crimson"), fallback: false });
    expect(getDeckSkin("deck.crimson")).toBe(getDeckSkin("crimson"));
    expect(getDeckSkin(DEFAULT_COSMETICS.deck)).toBe(getDeckSkin());
  });

  it("an unknown back gives the default and says so once, however many cards show it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 2; i++) {
      const { skin, fallback } = resolveDeck("deck.nope");
      expect(skin.id).toBe(DEFAULT_DECK_SKIN);
      expect(fallback).toBe(true);
    }
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('"deck.nope"');
    expect(resolveDeck("board.treasure-map").fallback).toBe(true);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("rejects a back with no art or a bad colour", () => {
    const good = { id: "x", name: "X", backUrl: "/x.webp", backColor: "#a2bdb2" };
    expect(deckSkinErrors(good)).toEqual([]);
    expect(deckSkinErrors({ ...good, backUrl: "" })).toEqual(["backUrl is missing"]);
    expect(deckSkinErrors({ ...good, backUrl: undefined })).toEqual(["backUrl is missing"]);
    for (const backColor of [undefined, "", "navy", "#abc", "#12345g", "#1234567"])
      expect(deckSkinErrors({ ...good, backColor })).toEqual([
        "backColor must be a #rrggbb colour",
      ]);
    expect(deckSkinErrors({ backUrl: "/x.webp", backColor: "#000000" })).toEqual([
      "id is missing",
      "name is missing",
    ]);
    expect(deckSkinErrors(null)).toEqual(["skin is not an object"]);
  });

  it("card faces are their own thing: the pirate portraits, never a back", () => {
    const courts = Object.values(PIRATE_PORTRAITS.courts);
    expect(PIRATE_PORTRAITS.id).toBe("pirate-portraits");
    expect(courts).toHaveLength(3);
    expect(new Set(courts).size).toBe(3);
    const backs = listDecks().map((d) => d.skin.backUrl);
    for (const url of courts) {
      expect(url).toMatch(/court-(jack|queen|king)/);
      expect(backs).not.toContain(url);
    }
  });
});
