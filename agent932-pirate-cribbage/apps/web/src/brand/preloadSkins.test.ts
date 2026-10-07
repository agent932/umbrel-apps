import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COSMETICS } from "@pirate/engine";
import { getBoardSkin } from "./boardSkins.js";
import { getDeckSkin } from "./deckSkins.js";

/** Stands in for the browser's Image: records each URL asked for, and decodes as told. */
function stubImage(decode: () => Promise<void>) {
  const requested: string[] = [];
  vi.stubGlobal(
    "Image",
    class {
      set src(url: string) {
        requested.push(url);
      }
      decode = decode;
    },
  );
  return requested;
}

/** A fresh copy of the module, so each test starts with nothing fetched. */
async function fresh() {
  vi.resetModules();
  return import("./preloadSkins.js");
}

/** The art a pair is drawn with: the board, its two pegs and the back. */
function artOf(board: string, deck: string) {
  const skin = getBoardSkin(board);
  return [skin.imageUrl, skin.pegUrls!.me, skin.pegUrls!.opponent, getDeckSkin(deck).backUrl];
}

describe("preloading skins", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches the board, both pegs and the back, once each however often it's asked", async () => {
    const requested = stubImage(() => Promise.resolve());
    const { preloadCosmetics } = await fresh();
    const pair = { board: "board.treasure-map", deck: "deck.crimson" };
    await preloadCosmetics(pair);
    await preloadCosmetics(pair);
    expect([...requested].sort()).toEqual(artOf(pair.board, pair.deck).sort());
    // Another board shares the pegs, and the back is already in hand: only its board is new.
    await preloadCosmetics({ board: "board.ghost-ship", deck: "deck.crimson" });
    expect(requested.slice(4)).toEqual([getBoardSkin("board.ghost-ship").imageUrl]);
  });

  it("settles only once the art is decoded, so a table can wait for it", async () => {
    let decoded!: () => void;
    const gate = new Promise<void>((resolve) => (decoded = resolve));
    const requested = stubImage(() => gate);
    const { preloadCosmetics } = await fresh();
    const settled: string[] = [];
    const first = preloadCosmetics(DEFAULT_COSMETICS).then(() => settled.push("first"));
    // Asking again waits on the same loads, not new ones.
    const again = preloadCosmetics(DEFAULT_COSMETICS).then(() => settled.push("again"));
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toEqual([]);
    expect(requested).toHaveLength(4);
    decoded();
    await Promise.all([first, again]);
    expect(settled.sort()).toEqual(["again", "first"]);
  });

  it("never rejects: art that fails to load is drawn by the table itself later", async () => {
    const requested = stubImage(() => Promise.reject(new Error("The image can't be decoded")));
    const { preloadCosmetics } = await fresh();
    await expect(preloadCosmetics(DEFAULT_COSMETICS)).resolves.toBeUndefined();
    expect(requested).toHaveLength(4);
  });

  it("fetches the defaults for items this build doesn't have", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const requested = stubImage(() => Promise.resolve());
    const { preloadCosmetics } = await fresh();
    await preloadCosmetics({ board: "board.from-a-newer-server", deck: "deck.likewise" });
    expect([...requested].sort()).toEqual(
      artOf(DEFAULT_COSMETICS.board, DEFAULT_COSMETICS.deck).sort(),
    );
  });
});
