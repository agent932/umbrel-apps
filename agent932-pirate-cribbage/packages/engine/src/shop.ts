/**
 * The shop: boards and card backs bought with doubloons. Pure data and types: the server and the
 * web both import it. The server's shop_items table is the authority for price and availability;
 * this list is the same catalog, so the web can name items (in ledger rows, for example).
 */
import type { Seat } from "./game.js";

export type ItemType = "board" | "deck";
export const ITEM_TYPES: readonly ItemType[] = ["board", "deck"];

/** What a table is drawn with: item ids (= skin asset keys). `deck` is the card back only. */
export interface Cosmetics {
  board: string;
  deck: string;
}
/** The host's choice, copied into an online game when it starts (server only). */
export interface TableCosmetics extends Cosmetics {
  hostId: string;
  /** Something the host uses is a preview (the shop is closed), so the defaults went in its place. */
  withheld?: true;
}
/** What the online state message carries: never the host's user id, only their seat. */
export interface OnlineCosmetics extends Cosmetics {
  hostSeat: Seat;
  /** Sent to the host alone: the table draws the defaults in place of their preview items. */
  withheld?: true;
}

export const DEFAULT_COSMETICS: Cosmetics = {
  board: "board.serpent-reef",
  deck: "deck.cribbage-logo",
};
/** What a new board costs (D-15). */
export const BOARD_PRICE = 1500;
/** What a new card back costs (D-15). */
export const DECK_PRICE = 1000;

export interface ShopItemDef {
  /** "board.treasure-map": the type, a dot, then the skin's id. Never renamed. */
  id: string;
  type: ItemType;
  name: string;
  description: string;
  /** In doubloons. 0 = free: owned by everyone (the defaults and any free extra). */
  price: number;
  /** Used when nothing else is chosen. One per type, always free. */
  isDefault: boolean;
  sort: number;
}

/**
 * Every item the shop has ever had, in the order the migrations added them. The database is the
 * authority for price and availability; a server test keeps the two equal. Price 0 = owned by
 * everyone.
 */
export const SHOP_ITEMS: readonly ShopItemDef[] = [
  {
    id: "board.serpent-reef",
    type: "board",
    name: "Serpent Reef",
    description: "The painted reef board every captain starts with, with standing pegs.",
    price: 0,
    isDefault: true,
    sort: 0,
  },
  {
    id: "board.treasure-map",
    type: "board",
    name: "Treasure Map",
    description:
      "Parchment panels in a walnut frame, with a galleon and a gold trail winding to buried treasure.",
    price: BOARD_PRICE,
    isDefault: false,
    sort: 10,
  },
  {
    id: "board.krakens-reef",
    type: "board",
    name: "Kraken's Reef",
    description:
      "Sea-glass driftwood panels, with a great kraken's tentacles coiling up the channels.",
    price: BOARD_PRICE,
    isDefault: false,
    sort: 20,
  },
  {
    id: "board.ghost-ship",
    type: "board",
    name: "Ghost Ship",
    description: "Bleached silver planks, with ghostly galleons sailing the fog-filled channels.",
    price: BOARD_PRICE,
    isDefault: false,
    sort: 30,
  },
  {
    id: "board.royal-navy",
    type: "board",
    name: "Royal Navy",
    description: "Scrubbed oak deck planks in a navy frame, trimmed with brass, rope and anchors.",
    price: BOARD_PRICE,
    isDefault: false,
    sort: 40,
  },
  {
    id: "deck.cribbage-logo",
    type: "deck",
    name: "Pirate Cribbage",
    description: "Navy backs with the Pirate Cribbage crest in gold.",
    price: 0,
    isDefault: true,
    sort: 0,
  },
  {
    id: "deck.moon-compass",
    type: "deck",
    name: "Moon and Compass",
    description: "Navy backs with a gold moon and compass: the first backs at the table.",
    price: 0,
    isDefault: false,
    sort: 5,
  },
  {
    id: "deck.ships-wheel",
    type: "deck",
    name: "Ship's Wheel",
    description: "Deep navy backs with a gold ship's wheel and anchor.",
    price: DECK_PRICE,
    isDefault: false,
    sort: 10,
  },
  {
    id: "deck.crimson",
    type: "deck",
    name: "Crimson",
    description: "Deep crimson backs with crossed gold cutlasses under a star.",
    price: DECK_PRICE,
    isDefault: false,
    sort: 20,
  },
  {
    id: "deck.treasure",
    type: "deck",
    name: "Treasure",
    description: "Emerald green backs with an open chest spilling gold.",
    price: DECK_PRICE,
    isDefault: false,
    sort: 30,
  },
  {
    id: "deck.ghost",
    type: "deck",
    name: "Ghost",
    description: "Misty sea-green backs with a ghost ship and silver flourishes.",
    price: DECK_PRICE,
    isDefault: false,
    sort: 40,
  },
];

/** An item id: its type, a dot, then lower-case letters, digits and dashes. */
const ITEM_ID = new RegExp(`^(${ITEM_TYPES.join("|")})\\.[a-z0-9-]+$`);

/** "board" for "board.x", null for anything else (including ids not in the item id format). */
export function itemType(id: string): ItemType | null {
  return (ITEM_ID.exec(id)?.[1] as ItemType | undefined) ?? null;
}

/** The item's name, or null when this build doesn't know it (an older app). */
export function shopItemName(id: string): string | null {
  return SHOP_ITEMS.find((i) => i.id === id)?.name ?? null;
}
