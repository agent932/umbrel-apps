import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  CLASSIC_RULES,
  applyAction,
  createDeck,
  createGame,
  shuffle,
  viewFor,
} from "@pirate/engine";
import { AuthProvider } from "../auth.js";
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
