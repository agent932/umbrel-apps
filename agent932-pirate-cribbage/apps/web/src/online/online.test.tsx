import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  CLASSIC_RULES,
  type GameEvent,
  type GameState,
  type OnlineCosmetics,
  type Seat,
  applyAction,
  createDeck,
  createGame,
  newGame,
  shuffle,
  viewFor,
} from "@pirate/engine";
import { App } from "../App.js";
import { AuthProvider } from "../auth.js";
import { FaceStyleContext } from "../brand/cosmetics.js";
import type { FaceStyle } from "../brand/faceStyles.js";
import { GameScreen } from "../screens/GameScreen.js";
import { OnlineLobby } from "./OnlineLobby.js";
import type { ServerMessage } from "./protocol.js";
import { useOnlineGame } from "./useOnlineGame.js";

/** Stands in for the browser WebSocket; tests play the server's part. */
class FakeSocket {
  static last: FakeSocket | null = null;
  static OPEN = 1;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  /** Deliver a message from the "server". */
  push(m: ServerMessage) {
    act(() => this.onmessage?.({ data: JSON.stringify(m) }));
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", FakeSocket);
  // The lobby asks who's signed in; answer as a signed-in player without a real server.
  const me = {
    id: "u1",
    username: "deckhand",
    email: "d@example.test",
    rating: 1000,
    rankedGames: 0,
  };
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ user: me }), { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());

const opened = () => act(() => new Promise((r) => setTimeout(r, 5)));

describe("online lobby", () => {
  it("creates an invite and shows the link to share", async () => {
    const user = userEvent.setup();
    const { hook } = memoryLocation({ path: "/" });
    render(
      <Router hook={hook}>
        <AuthProvider>
          <OnlineLobby />
        </AuthProvider>
      </Router>,
    );
    await opened();
    const ws = FakeSocket.last!;
    ws.push({
      t: "hello",
      username: "deckhand",
      activeGames: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(screen.getByRole("button", { name: /Rejoin game/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Invite a friend" }));
    expect(ws.sent.at(-1)).toEqual({
      t: "createInvite",
      menu: { variant: "pirate", powerCost: 0 },
    });
    ws.push({ t: "invite", code: "ABC234" });
    expect(screen.getByLabelText("Invite link")).toHaveValue(`${location.origin}/join/ABC234`);
  });

  it("queues for Quick Match and goes to the game when matched", async () => {
    const user = userEvent.setup();
    const loc = memoryLocation({ path: "/", record: true });
    render(
      <Router hook={loc.hook}>
        <AuthProvider>
          <OnlineLobby />
        </AuthProvider>
      </Router>,
    );
    await opened();
    const ws = FakeSocket.last!;
    await user.click(screen.getByRole("button", { name: "classic" }));
    await user.click(screen.getByRole("button", { name: "Quick match" }));
    expect(ws.sent.at(-1)).toEqual({ t: "queue", menu: { variant: "classic", powerCost: 0 } });
    ws.push({ t: "queued" });
    expect(screen.getByRole("status")).toHaveTextContent(/Scanning the horizon/);
    ws.push({ t: "matched", gameId: "22222222-2222-4222-8222-222222222222" });
    expect(loc.history.at(-1)).toBe("/online/22222222-2222-4222-8222-222222222222");
  });
});

function OnlineTable({ gameId }: { gameId: string }) {
  const game = useOnlineGame(gameId);
  if ("loading" in game) return <p>loading</p>;
  return <GameScreen game={game} onExit={() => {}} onPlayAgain={() => {}} />;
}

describe("online game screen", () => {
  it("shows your seat's view, the opponent's name and the move timer, and sends moves", async () => {
    const user = userEvent.setup();
    const gameId = "33333333-3333-4333-8333-333333333333";
    render(<OnlineTable gameId={gameId} />);
    await opened();
    const ws = FakeSocket.last!;
    expect(ws.sent).toContainEqual({ t: "watch", gameId, carryOn: true });

    // We're seat 1 in this game.
    const state = applyAction(createGame(0, CLASSIC_RULES), {
      type: "deal",
      deck: shuffle(createDeck()),
    }).state;
    ws.push({
      t: "state",
      gameId,
      seat: 1,
      names: ["Anne", "Bonny"],
      step: { events: [], view: viewFor(state, 1) },
      deadline: Date.now() + 42_000,
      online: [false, true],
      returnBy: [Date.now() + 4 * 60_000 + 30_000, null],
      nextRoundReady: [],
    });
    expect(screen.getByLabelText("Anne")).toHaveTextContent(/offline/i);
    expect(screen.getByLabelText("Anne")).toHaveTextContent(/4:(30|29) to return/);
    expect(screen.getByText(/Throw two cards to Anne's crib/)).toBeInTheDocument();
    expect(screen.getByTitle("Time to move")).toHaveTextContent(/4[12]s/);

    const cards = within(screen.getByLabelText("Your hand")).getAllByRole("button");
    await user.click(cards[0]!);
    await user.click(cards[1]!);
    await user.click(screen.getByRole("button", { name: "Throw to crib" }));
    expect(ws.sent.at(-1)).toMatchObject({ t: "act", gameId, action: { type: "discard" } });

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Forfeit" }));
    expect(ws.sent.at(-1)).toEqual({ t: "forfeit", gameId });
  });
  it("carries on past a pirate scene with the server, and says when the table closes", async () => {
    const user = userEvent.setup();
    const gameId = "55555555-5555-4555-8555-555555555555";
    const { unmount } = render(<OnlineTable gameId={gameId} />);
    await opened();
    const ws = FakeSocket.last!;
    const state = applyAction(createGame(0, CLASSIC_RULES), {
      type: "deal",
      deck: shuffle(createDeck()),
    }).state;
    const message = (sceneWaits: (0 | 1)[], events: GameEvent[] = []): ServerMessage => ({
      t: "state",
      gameId,
      seat: 1,
      names: ["Anne", "Bonny"],
      avatars: [null, null],
      ranked: false,
      step: { events, view: viewFor(state, 1) },
      deadline: Date.now() + 60_000,
      online: [true, true],
      returnBy: [null, null],
      nextRoundReady: [],
      sceneWaits,
    });
    ws.push(message([0, 1], [{ type: "kraken", seat: 0, points: -4, hole: 45 }]));
    const scene = screen.getByRole("dialog", { name: /The Kraken drags Anne back!/ });
    await user.click(within(scene).getByRole("button", { name: "Carry on" }));
    expect(ws.sent.at(-1)).toEqual({ t: "carryOn", gameId });
    expect(within(scene).getByRole("status")).toHaveTextContent("Waiting for Anne…");
    ws.push({ t: "waiting", gameId, for: "scene", ready: [1] });
    expect(screen.getByRole("dialog", { name: /Kraken/ })).toBeInTheDocument();
    ws.push(message([]));
    expect(screen.queryByRole("dialog", { name: /Kraken/ })).toBeNull();

    unmount();
    expect(ws.sent.at(-1)).toEqual({ t: "leftTable", gameId });
  });

  it("sends an older server (no scene waits) nothing it wouldn't know", async () => {
    const user = userEvent.setup();
    const gameId = "66666666-6666-4666-8666-666666666666";
    const { unmount } = render(<OnlineTable gameId={gameId} />);
    await opened();
    const ws = FakeSocket.last!;
    const state = applyAction(createGame(0, CLASSIC_RULES), {
      type: "deal",
      deck: shuffle(createDeck()),
    }).state;
    ws.push({
      t: "state",
      gameId,
      seat: 1,
      names: ["Anne", "Bonny"],
      avatars: [null, null],
      ranked: false,
      step: {
        events: [{ type: "kraken", seat: 0, points: -4, hole: 45 }],
        view: viewFor(state, 1),
      },
      deadline: null,
      online: [true, true],
      returnBy: [null, null],
      nextRoundReady: [],
    });
    await user.click(screen.getByRole("button", { name: "Carry on" }));
    expect(screen.queryByRole("dialog", { name: /Kraken/ })).toBeNull();
    unmount();
    expect(ws.sent.filter((m) => m.t === "carryOn" || m.t === "leftTable")).toEqual([]);
  });

  it("calls out to the other player, and offers a rematch when the game is over", async () => {
    const user = userEvent.setup();
    const gameId = "44444444-4444-4444-8444-444444444444";
    render(<OnlineTable gameId={gameId} />);
    await opened();
    const ws = FakeSocket.last!;
    const state = applyAction(createGame(0, CLASSIC_RULES), {
      type: "deal",
      deck: shuffle(createDeck()),
    }).state;
    const message = (view: ReturnType<typeof viewFor>): ServerMessage => ({
      t: "state",
      gameId,
      seat: 0,
      names: ["Anne", "Bonny"],
      ranked: false,
      step: { events: [], view },
      deadline: null,
      online: [true, true],
      returnBy: [null, null],
      nextRoundReady: [],
    });
    ws.push(message(viewFor(state, 0)));

    await user.click(screen.getByRole("button", { name: "Call out" }));
    await user.click(screen.getByRole("menuitem", { name: "Arr!" }));
    expect(ws.sent.at(-1)).toEqual({ t: "emote", gameId, emote: "arr" });
    ws.push({ t: "emote", gameId, seat: 1, emote: "shiver" });
    expect(screen.getByLabelText("Bonny")).toHaveTextContent("Shiver me timbers!");

    // The state that ends the game brings your doubloons; later ones don't, and they stay.
    ws.push({
      ...message({ ...viewFor(state, 0), phase: "gameOver", winner: 0, skunk: 0 }),
      reward: {
        lines: [
          { reason: "onlineWin", delta: 50 },
          { reason: "firstWinOfDay", delta: 50 },
        ],
        total: 100,
        balance: 100,
        note: null,
        unlocked: [],
      },
    } as ServerMessage);
    ws.push(message({ ...viewFor(state, 0), phase: "gameOver", winner: 0, skunk: 0 }));
    const end = screen.getByRole("dialog", { name: "Victory!" });
    expect(within(end).getByRole("status")).toHaveTextContent("+100 doubloons");
    expect(within(end).getByRole("list", { name: "Doubloons earned" })).toHaveTextContent(
      /Online win\s*\+50\s*First win of the day\s*\+50/,
    );
    ws.push({ t: "rematchOffer", gameId, from: "Bonny" });
    expect(screen.getByText("Bonny wants a rematch!")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept rematch" }));
    expect(ws.sent.at(-1)).toEqual({ t: "rematch", gameId });
  });
});

describe("the host's board and card backs", () => {
  /** A state message for seat `seat`, with the host's cosmetics when given. */
  const stateFor = (
    gameId: string,
    state: GameState,
    seat: Seat,
    cosmetics?: OnlineCosmetics,
  ): ServerMessage => ({
    t: "state",
    gameId,
    seat,
    names: ["Anne", "Bonny"],
    avatars: [null, null],
    ...(cosmetics && { cosmetics }),
    ranked: false,
    step: { events: [], view: viewFor(state, seat) },
    deadline: null,
    online: [true, true],
    returnBy: [null, null],
    nextRoundReady: [],
    sceneWaits: [],
  });
  /** Waiting to cut for the deal, the deck spread face down. */
  const cutting = () =>
    applyAction(newGame(CLASSIC_RULES), { type: "shuffleForCut", deck: shuffle(createDeck()) })
      .state;
  /** Dealt from `deck`, both players have thrown to the crib: four cards each, four in the crib. */
  function thrown(deck = shuffle(createDeck())) {
    let state = applyAction(createGame(0, CLASSIC_RULES), { type: "deal", deck }).state;
    for (const seat of [0, 1] as const)
      state = applyAction(state, {
        type: "discard",
        seat,
        cards: state.hands[seat].slice(0, 2),
      }).state;
    return state;
  }
  const boardSkin = () => document.querySelector(".t-board > svg")?.getAttribute("data-skin");
  const backsIn = (selector: string) =>
    [...document.querySelector(selector)!.querySelectorAll("[data-deck]")].map((c) =>
      c.getAttribute("data-deck"),
    );
  const menuText = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const text = screen.getByRole("dialog", { name: "Menu" }).textContent;
    await user.click(screen.getByRole("button", { name: "Close" }));
    return text;
  };

  it("draws the host's board and backs from the cut for deal on, and your own faces", async () => {
    const user = userEvent.setup();
    const gameId = "77777777-7777-4777-8777-777777777777";
    // Your own face style, which no host can change.
    const faces: FaceStyle = {
      id: "stub",
      courts: { 11: "/stub-jack.webp", 12: "/stub-queen.webp", 13: "/stub-king.webp" },
    };
    render(
      <FaceStyleContext.Provider value={faces}>
        <OnlineTable gameId={gameId} />
      </FaceStyleContext.Provider>,
    );
    await opened();
    const ws = FakeSocket.last!;
    // Anne hosts from seat 0; you're Bonny, in seat 1.
    const cosmetics = { board: "board.treasure-map", deck: "deck.crimson", hostSeat: 0 } as const;

    ws.push(stateFor(gameId, cutting(), 1, cosmetics));
    expect(
      within(screen.getByRole("group", { name: "Deck to cut" }))
        .getAllByRole("img")
        .map((c) => c.getAttribute("data-deck")),
    ).toEqual(Array(52).fill("crimson"));

    // Every card dealt is a court card, so your hand shows only faces.
    const deck = createDeck();
    ws.push(
      stateFor(
        gameId,
        thrown([...deck.filter((c) => c.rank >= 11), ...deck.filter((c) => c.rank < 11)]),
        1,
        cosmetics,
      ),
    );
    expect(boardSkin()).toBe("treasure-map");
    expect(backsIn(".t-opp-fan")).toEqual(Array(4).fill("crimson"));
    expect(backsIn(".t-deck")).toEqual(Array(3).fill("crimson"));
    expect(backsIn(".t-crib")).toEqual(Array(4).fill("crimson"));
    const courts = within(screen.getByLabelText("Your hand"))
      .getAllByRole("button")
      .map((card) => card.querySelector<HTMLElement>("span[aria-hidden]")!.style.backgroundImage);
    expect(courts).toHaveLength(4);
    for (const art of courts) expect(art).toMatch(/^url\("\/stub-(jack|queen|king)\.webp"\)$/);
    expect(await menuText(user)).toContain("Board and card backs: Anne's");
  });

  it("says they're yours when you host", async () => {
    const user = userEvent.setup();
    const gameId = "88888888-8888-4888-8888-888888888888";
    render(<OnlineTable gameId={gameId} />);
    await opened();
    const cosmetics = { board: "board.ghost-ship", deck: "deck.ghost", hostSeat: 0 } as const;
    FakeSocket.last!.push(stateFor(gameId, thrown(), 0, cosmetics));
    expect(boardSkin()).toBe("ghost-ship");
    expect(backsIn(".t-opp-fan")).toEqual(Array(4).fill("ghost"));
    expect(await menuText(user)).toContain("Board and card backs: yours");
  });

  it("draws the defaults when an older server doesn't say, and doesn't say whose they are", async () => {
    const user = userEvent.setup();
    const gameId = "99999999-9999-4999-8999-999999999999";
    render(<OnlineTable gameId={gameId} />);
    await opened();
    FakeSocket.last!.push(stateFor(gameId, thrown(), 1));
    expect(boardSkin()).toBe("serpent-reef");
    expect(backsIn(".t-opp-fan")).toEqual(Array(4).fill("cribbage-logo"));
    expect(await menuText(user)).not.toMatch(/Board and card/);
  });

  describe("boarding", () => {
    /**
     * The app loaded afresh for each test. A URL is preloaded once for the whole module, so
     * without this a load an earlier test left hanging (or already finished) would decide whether
     * this test's table waits.
     */
    let FreshApp: typeof App;
    beforeEach(async () => {
      vi.resetModules();
      ({ App: FreshApp } = await import("../App.js"));
    });
    /** Images that decode only when the test says so. */
    function slowArt() {
      let decoded!: () => void;
      const gate = new Promise<void>((resolve) => (decoded = resolve));
      vi.stubGlobal(
        "Image",
        class {
          src = "";
          decode = () => gate;
        },
      );
      return decoded;
    }
    /** The whole app on an online game's page, with the socket open. */
    async function board(gameId: string) {
      window.history.pushState({}, "", `/online/${gameId}`);
      render(<FreshApp />);
      await waitFor(() =>
        expect(FakeSocket.last?.sent).toContainEqual({ t: "watch", gameId, carryOn: true }),
      );
      return FakeSocket.last!;
    }
    const deckToCut = () => screen.queryByRole("group", { name: "Deck to cut" });
    afterEach(() => {
      vi.useRealTimers();
      window.history.pushState({}, "", "/");
    });

    it("waits for the host's art before the cut for deal", async () => {
      const decoded = slowArt();
      const gameId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const ws = await board(gameId);
      const cosmetics = {
        board: "board.royal-navy",
        deck: "deck.ships-wheel",
        hostSeat: 0,
      } as const;
      ws.push(stateFor(gameId, cutting(), 1, cosmetics));
      // Still boarding once everything already settled has run: it really waits for the art.
      await act(async () => {});
      expect(screen.getByText("Boarding…")).toBeInTheDocument();
      expect(deckToCut()).toBeNull();
      await act(async () => decoded());
      expect(deckToCut()).toBeInTheDocument();
      expect(within(deckToCut()!).getAllByRole("img")[0]).toHaveAttribute(
        "data-deck",
        "ships-wheel",
      );
    });

    it("opens the table anyway when the art is slow", async () => {
      slowArt();
      const gameId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const ws = await board(gameId);
      vi.useFakeTimers();
      const cosmetics = {
        board: "board.krakens-reef",
        deck: "deck.treasure",
        hostSeat: 1,
      } as const;
      ws.push(stateFor(gameId, cutting(), 1, cosmetics));
      act(() => vi.advanceTimersByTime(799));
      expect(screen.getByText("Boarding…")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(deckToCut()).toBeInTheDocument();
    });

    it("doesn't wait when the server sends no board or backs", async () => {
      slowArt();
      const gameId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const ws = await board(gameId);
      ws.push(stateFor(gameId, cutting(), 1));
      expect(deckToCut()).toBeInTheDocument();
    });
  });
});
