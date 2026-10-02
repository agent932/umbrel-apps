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

beforeEach(() => vi.stubGlobal("WebSocket", FakeSocket));
afterEach(() => vi.unstubAllGlobals());

const opened = () => act(() => new Promise((r) => setTimeout(r, 5)));

describe("online lobby", () => {
  it("creates an invite and shows the link to share", async () => {
    const user = userEvent.setup();
    const { hook } = memoryLocation({ path: "/" });
    render(
      <Router hook={hook}>
        <OnlineLobby />
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
        <OnlineLobby />
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
    expect(ws.sent).toContainEqual({ t: "watch", gameId });

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
      nextRoundReady: [],
    });
    expect(screen.getByLabelText("Anne")).toHaveTextContent(/offline/i);
    expect(screen.getByText(/Throw two cards to Anne's crib/)).toBeInTheDocument();
    expect(screen.getByTitle("Time to move")).toHaveTextContent(/4[12]s/);

    const cards = within(screen.getByLabelText("Your hand")).getAllByRole("button");
    await user.click(cards[0]!);
    await user.click(cards[1]!);
    await user.click(screen.getByRole("button", { name: "Throw to crib" }));
    expect(ws.sent.at(-1)).toMatchObject({ t: "act", gameId, action: { type: "discard" } });

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Forfeit" }));
    expect(ws.sent.at(-1)).toEqual({ t: "forfeit", gameId });
  });
});
