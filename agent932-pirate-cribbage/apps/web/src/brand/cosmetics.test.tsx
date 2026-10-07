import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_COSMETICS } from "@pirate/engine";
import { AuthProvider } from "../auth.js";
import { getBoardSkin } from "./boardSkins.js";
import {
  ViewerCosmetics,
  useBoardSkin,
  useCosmetics,
  useDeckSkin,
  useFaceStyle,
} from "./cosmetics.js";
import { getDeckSkin } from "./deckSkins.js";
import { PIRATE_PORTRAITS } from "./faceStyles.js";

/** What the contexts hold where this is drawn. */
function Probe() {
  const { board, deck } = useCosmetics();
  return (
    <p>
      {board} {deck} {useBoardSkin().name} / {useDeckSkin().name} /{" "}
      {useFaceStyle() === PIRATE_PORTRAITS ? "pirate portraits" : "other faces"}
    </p>
  );
}

describe("the board and back contexts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hold the defaults and the pirate portraits with no provider", () => {
    render(<Probe />);
    expect(screen.getByText(/board\./)).toHaveTextContent(
      `${DEFAULT_COSMETICS.board} ${DEFAULT_COSMETICS.deck} Serpent Reef / Pirate Cribbage / pirate portraits`,
    );
  });

  it("hold what a signed-in player uses, and fetch its art (and the defaults) before any table", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(url: string) {
          requested.push(url);
        }
        decode = () => Promise.resolve();
      },
    );
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            user: {
              id: "u1",
              username: "Bonny",
              equippedBoard: "board.treasure-map",
              equippedDeck: "deck.crimson",
            },
          }),
        ),
    );
    render(
      <AuthProvider>
        <ViewerCosmetics>
          <Probe />
        </ViewerCosmetics>
      </AuthProvider>,
    );
    expect(await screen.findByText(/Treasure Map/)).toHaveTextContent(
      "board.treasure-map deck.crimson Treasure Map / Crimson / pirate portraits",
    );
    const mine = getBoardSkin("board.treasure-map");
    const defaults = getBoardSkin();
    await waitFor(() => expect(requested).toContain(mine.imageUrl));
    expect([...requested].sort()).toEqual(
      [
        defaults.imageUrl,
        defaults.pegUrls!.me,
        defaults.pegUrls!.opponent,
        getDeckSkin().backUrl,
        mine.imageUrl,
        getDeckSkin("deck.crimson").backUrl,
      ].sort(),
    );
  });
});
