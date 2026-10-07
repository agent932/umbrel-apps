// Card backs: a deck item is a card back only. Every card keeps its faces whatever the back
// (faces live in faceStyles.ts). A back has no hole map, so the registry is plain TypeScript.
// A back's key is its shop item id ("deck.crimson") or its bare skin id ("crimson").
import logoBackUrl from "../assets/table/card-back-logo.webp";
import moonCompassBackUrl from "../assets/table/card-back.webp";
import shipsWheelBackUrl from "../assets/table/card-back-ships-wheel.webp";
import crimsonBackUrl from "../assets/table/card-back-crimson.webp";
import treasureBackUrl from "../assets/table/card-back-treasure.webp";
import ghostBackUrl from "../assets/table/card-back-ghost.webp";

export interface DeckSkin {
  id: string;
  name: string;
  /** The card back, drawn with background-size: cover (keep the motif inside the middle 82% of
   *  the height: the card boxes crop about 9% top and bottom). */
  backUrl: string;
  /** The back's field colour, painted under the image, so a back that hasn't loaded still looks
   *  like a card. Sampled from each back's field, clear of the border and the medallion. */
  backColor: string;
}

export const DEFAULT_DECK_SKIN = "cribbage-logo";

/** Every back the app ships, keyed by its id. */
const REGISTRY: Record<string, DeckSkin> = {
  "cribbage-logo": {
    id: "cribbage-logo",
    name: "Pirate Cribbage",
    backUrl: logoBackUrl,
    backColor: "#272c44",
  },
  "moon-compass": {
    id: "moon-compass",
    name: "Moon and Compass",
    backUrl: moonCompassBackUrl,
    backColor: "#242c44",
  },
  "ships-wheel": {
    id: "ships-wheel",
    name: "Ship's Wheel",
    backUrl: shipsWheelBackUrl,
    backColor: "#091d4a",
  },
  crimson: { id: "crimson", name: "Crimson", backUrl: crimsonBackUrl, backColor: "#6f1b27" },
  treasure: { id: "treasure", name: "Treasure", backUrl: treasureBackUrl, backColor: "#1c402f" },
  ghost: { id: "ghost", name: "Ghost", backUrl: ghostBackUrl, backColor: "#a2bdb2" },
};

const PREFIX = "deck.";
/** The skin id for a key: "deck.crimson" and "crimson" are the same back. */
const skinId = (key: string) => (key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key);

const isText = (v: unknown) => typeof v === "string" && v !== "";

/** What's wrong with a back, or an empty list when it's fine to draw. */
export function deckSkinErrors(skin: unknown): string[] {
  if (!skin || typeof skin !== "object") return ["skin is not an object"];
  const s = skin as Record<string, unknown>;
  const errors: string[] = [];
  if (!isText(s.id)) errors.push("id is missing");
  if (!isText(s.name)) errors.push("name is missing");
  if (!isText(s.backUrl)) errors.push("backUrl is missing");
  if (typeof s.backColor !== "string" || !/^#[0-9a-f]{6}$/i.test(s.backColor))
    errors.push("backColor must be a #rrggbb colour");
  return errors;
}

const cache = new Map<string, DeckSkin>();
/** Keys already reported, so a back drawn on every card logs once. */
const reported = new Set<string>();

/**
 * The back to draw for a key. An unknown or broken back (say, an item from a newer server that
 * this build lacks) gives the default back with `fallback: true`, and logs why once per key.
 */
export function resolveDeck(key: string): { skin: DeckSkin; fallback: boolean } {
  const id = skinId(key);
  const hit = cache.get(id);
  if (hit) return { skin: hit, fallback: false };
  const entry = REGISTRY[id];
  const errors = entry ? deckSkinErrors(entry) : ["no such back"];
  if (entry && !errors.length) {
    cache.set(id, entry);
    return { skin: entry, fallback: false };
  }
  if (id === DEFAULT_DECK_SKIN)
    throw new Error(`The default card back is broken: ${errors.join("; ")}`);
  if (!reported.has(key)) {
    reported.add(key);
    console.error(`Card back "${key}" can't be used, so the default back is shown:`, errors);
  }
  return { skin: resolveDeck(DEFAULT_DECK_SKIN).skin, fallback: true };
}

/** The card back to draw. An unknown or broken back gives the default back. */
export const getDeckSkin = (key: string = DEFAULT_DECK_SKIN) => resolveDeck(key).skin;

/** Every back the app ships, keyed by item id. */
export function listDecks(): { key: string; skin: DeckSkin }[] {
  return Object.keys(REGISTRY).map((id) => ({ key: PREFIX + id, skin: resolveDeck(id).skin }));
}
