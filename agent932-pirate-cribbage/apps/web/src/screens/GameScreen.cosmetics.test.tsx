import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CLASSIC_RULES,
  DEFAULT_COSMETICS,
  type OnlineCosmetics,
  botAction,
  other,
} from "@pirate/engine";
import type { User } from "../api.js";
import { AuthProvider, useAuth } from "../auth.js";
import { ViewerCosmetics } from "../brand/cosmetics.js";
import { Card } from "../components/Card.js";
import { BOT, YOU, houseAction, names, newLocalGame, step } from "../game/localGame.js";
import type { GameController, OnlineInfo } from "../game/types.js";
import { GameScreen } from "./GameScreen.js";

/** A crew game dealt and waiting for you to throw to the crib. */
function crewGame(): GameController {
  let game = newLocalGame({ level: "medium", rules: CLASSIC_RULES });
  for (let i = 0; i < 50 && game.state.phase !== "discard"; i++) {
    const { state } = game;
    const move =
      houseAction(state) ?? botAction(state, YOU, "easy") ?? botAction(state, BOT, "easy");
    game = step(game, move!);
  }
  expect(game.state.phase).toBe("discard");
  return {
    p: game.p,
    names: names("medium"),
    level: "medium",
    act: () => {},
    error: null,
    ranked: false,
  };
}

/** The same table as an online game, with whatever cosmetics the server sent. */
function onlineGame(cosmetics: OnlineCosmetics | null): GameController {
  const online: OnlineInfo = {
    deadline: null,
    online: [true, true],
    avatars: [null, null],
    cosmetics,
    ranked: false,
    emote: null,
    sendEmote: () => {},
    rematch: "none",
    requestRematch: () => {},
    rematchGameId: null,
    returnBy: [null, null],
    nextRoundReady: [],
    sceneWaits: [],
    carryOn: () => {},
    forfeit: () => {},
    forfeitedBy: null,
  };
  return { ...crewGame(), level: null, ranked: true, online };
}

/** /api/auth/me answers with this player (or fails, for "offline"). */
function signedIn(user: Partial<User> | null | "offline") {
  vi.stubGlobal("fetch", async () => {
    if (user === "offline") throw new TypeError("Failed to fetch");
    const me = user && {
      id: "u1",
      username: "Bonny",
      email: "b@example.test",
      rating: 1000,
      rankedGames: 0,
      avatar: null,
      isAdmin: false,
      ...user,
    };
    return new Response(JSON.stringify({ user: me, shopOpen: false }), { status: 200 });
  });
}

/** Who's signed in, once the app knows, and the back they use away from the table. */
function Viewer() {
  const { user, loading } = useAuth();
  return (
    <>
      <p>{loading ? "Checking…" : `Viewer: ${user?.username ?? "guest"}`}</p>
      <Card hidden label="Your own back" />
    </>
  );
}

const show = (game: GameController) =>
  render(
    <AuthProvider>
      <ViewerCosmetics>
        <Viewer />
        <GameScreen game={game} onExit={() => {}} onPlayAgain={() => {}} instant />
      </ViewerCosmetics>
    </AuthProvider>,
  );
/** Wait for the sign-in check to finish. */
const known = () => screen.findByText(/^Viewer:/);
const ownBack = () => screen.getByRole("img", { name: "Your own back" }).getAttribute("data-deck");
const boardSkin = () => document.querySelector(".t-board > svg")!.getAttribute("data-skin");
const fanBacks = () =>
  [...document.querySelectorAll(".t-opp-fan [data-deck]")].map((c) => c.getAttribute("data-deck"));

describe("the board and backs at the table", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a crew game uses your own board and backs", async () => {
    signedIn({ equippedBoard: "board.krakens-reef", equippedDeck: "deck.crimson" });
    show(crewGame());
    expect(await known()).toHaveTextContent("Viewer: Bonny");
    expect(boardSkin()).toBe("krakens-reef");
    expect(fanBacks()).toEqual(Array(6).fill("crimson"));
    expect(document.querySelector('.t-deck [data-deck="crimson"]')).not.toBeNull();
  });

  it("a guest, or a player the app can't reach the server for, gets the defaults", async () => {
    for (const who of [null, "offline", { equippedBoard: null, equippedDeck: null }] as const) {
      signedIn(who);
      const { unmount } = show(crewGame());
      await known();
      expect(boardSkin()).toBe("serpent-reef");
      expect(fanBacks()).toEqual(Array(6).fill("cribbage-logo"));
      unmount();
    }
  });

  it("an online game uses the host's, whatever you use", async () => {
    const user = userEvent.setup();
    signedIn({ equippedBoard: "board.krakens-reef", equippedDeck: "deck.crimson" });
    // The other player hosts.
    const host = other(YOU);
    const { unmount } = show(
      onlineGame({ board: "board.royal-navy", deck: "deck.treasure", hostSeat: host }),
    );
    await known();
    expect(ownBack()).toBe("crimson");
    expect(boardSkin()).toBe("royal-navy");
    expect(fanBacks()).toEqual(Array(6).fill("treasure"));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toHaveTextContent(
      `Board and card backs: ${names("medium")[host]}'s`,
    );
    unmount();

    // A server that doesn't send them: the defaults for both players, never your own.
    show(onlineGame(null));
    await known();
    expect(ownBack()).toBe("crimson");
    expect(boardSkin()).toBe("serpent-reef");
    expect(fanBacks()).toEqual(Array(6).fill("cribbage-logo"));
  });

  it("tells a host whose own are a preview that the table has the defaults", async () => {
    const user = userEvent.setup();
    // An admin using preview items while the shop is closed: the server sent the defaults.
    signedIn({ isAdmin: true, equippedBoard: "board.krakens-reef", equippedDeck: "deck.crimson" });
    const { unmount } = show(onlineGame({ ...DEFAULT_COSMETICS, hostSeat: YOU, withheld: true }));
    await known();
    expect(boardSkin()).toBe("serpent-reef");
    expect(fanBacks()).toEqual(Array(6).fill("cribbage-logo"));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toHaveTextContent(
      "Board and card backs: the defaults (what you use shows only to you until the shop opens)",
    );
    unmount();

    // Hosting with what they use on the table: theirs.
    show(onlineGame({ board: "board.krakens-reef", deck: "deck.crimson", hostSeat: YOU }));
    await known();
    expect(boardSkin()).toBe("krakens-reef");
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toHaveTextContent(
      "Board and card backs: yours",
    );
  });

  it("the table menu of a crew game doesn't say whose board it is", async () => {
    const user = userEvent.setup();
    signedIn({ equippedDeck: "deck.crimson" });
    show(crewGame());
    await known();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).not.toHaveTextContent(/Board and card/);
  });
});
