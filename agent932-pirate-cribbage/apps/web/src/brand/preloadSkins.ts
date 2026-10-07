// Skin art is fetched and decoded before a table needs it, so a board or back seen for the first
// time (often the host's, at the cut for deal) never shows as a bare board or empty card outlines.
// Every face-down card shares one URL per back, so the 52 cards in the cut cost one fetch.
import type { Cosmetics } from "@pirate/engine";
import { resolveBoard } from "./boardSkins.js";
import { resolveDeck } from "./deckSkins.js";

/** Each URL's load, started once. The image is kept so its decoded art stays in memory. */
const loads = new Map<string, { img: HTMLImageElement; done: Promise<void> }>();

function preload(url: string): Promise<void> {
  const had = loads.get(url);
  if (had) return had.done;
  const img = new Image();
  img.src = url;
  // Every browser the app supports has decode(); without it (tests) there's nothing to wait for.
  // A failed load is fine: the card or board fetches its art itself when it draws.
  const done = typeof img.decode === "function" ? img.decode().catch(() => {}) : Promise.resolve();
  loads.set(url, { img, done });
  return done;
}

/** Fetch and decode the board, its pegs and the back for this pair, once per URL. Never rejects. */
export function preloadCosmetics(c: Cosmetics): Promise<void> {
  if (typeof Image === "undefined") return Promise.resolve();
  const board = resolveBoard(c.board).skin;
  const urls = [
    board.imageUrl,
    ...(board.pegUrls ? [board.pegUrls.me, board.pegUrls.opponent] : []),
    resolveDeck(c.deck).skin.backUrl,
  ];
  return Promise.all(urls.map(preload)).then(() => {});
}
