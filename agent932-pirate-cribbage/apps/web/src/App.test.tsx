import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CLASSIC_RULES,
  type GameState,
  applyAction,
  botAction,
  createDeck,
  hostAction,
  SHOP_ITEMS,
  newGame,
  redactEvent,
  seededRandom,
  shuffle,
  toAct,
  viewFor,
} from "@pirate/engine";
import type { GameResponse, Reward, Step, User } from "./api.js";
import { App } from "./App.js";

async function startGame(
  rules: "Classic" | "Pirate" = "Pirate",
  level: "Easy" | "Medium" = "Medium",
) {
  const user = userEvent.setup();
  window.history.pushState({}, "", "/cribbage");
  render(<App botDelay={0} />);
  await user.click(screen.getByLabelText(new RegExp(`^${level}`)));
  await user.click(screen.getByLabelText(new RegExp(`^${rules}`)));
  await user.click(screen.getByRole("button", { name: /set sail/i }));
  await cutForDeal(user);
  return user;
}

/** Cut any card until the deal is decided (a tie means cutting again). */
async function cutForDeal(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 20; i++) {
    const free = screen
      .queryAllByRole("button", { name: /^Cut card/ })
      .filter((b) => !b.hasAttribute("disabled"));
    if (free.length) await user.click(free[0]!);
    if (screen.queryByLabelText("Your hand")) return;
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Your hand") ??
          screen.queryAllByRole("button", { name: /^Cut card/ })[0],
      ).toBeTruthy(),
    );
  }
}

const hand = () => within(screen.getByLabelText("Your hand"));

describe("playing vs the bot", () => {
  it("deals six cards and throws two to the crib", async () => {
    const user = await startGame("Classic");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));

    const throwBtn = screen.getByRole("button", { name: "Throw to crib" });
    expect(throwBtn).toBeDisabled();
    const [a, b] = hand().getAllByRole("button");
    await user.click(a!);
    await user.click(b!);
    expect(a).toHaveAttribute("aria-pressed", "true");
    await user.click(throwBtn);

    // After both discard the pone cuts; if that's us, we press the button. (The cut card stays on
    // the deck; the log line about it can scroll away as soon as the bot plays.)
    const cutCard = () => screen.queryByRole("img", { name: /^Cut card:/ });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cut the deck" }) ?? cutCard()).toBeTruthy(),
    );
    const cut = screen.queryByRole("button", { name: "Cut the deck" });
    if (cut) await user.click(cut);
    await waitFor(() => expect(cutCard()).toBeTruthy());
    await waitFor(() => expect(hand().getAllByRole("button").length).toBeLessThanOrEqual(4));
  });

  it("uses the Spyglass to see the opponent's hand", async () => {
    const user = await startGame("Pirate");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));
    await user.click(screen.getByRole("button", { name: /Spyglass/ }));
    // The power explains itself first; then you use it.
    expect(screen.getByRole("dialog", { name: "Spyglass" })).toHaveTextContent(/Peek at/);
    await user.click(screen.getByRole("button", { name: "Use Spyglass" }));
    const spied = await screen.findByLabelText("Opponent's hand seen through the spyglass");
    // Six cards, or the four they kept if the bot already discarded.
    expect(within(spied).getAllByRole("img").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/You used Spyglass/).length).toBeGreaterThan(0);
  });

  it("plays a full game to the end", async () => {
    const user = await startGame("Pirate", "Easy");
    for (let i = 0; i < 400; i++) {
      if (screen.queryByRole("dialog", { name: /Victory|Defeat/ })) break;
      const next = screen.queryByRole("button", { name: "Next round" });
      const ready = screen.queryByRole("button", { name: /Set sail/ });
      const cut = screen.queryByRole("button", { name: "Cut the deck" });
      const throwBtn = screen.queryByRole("button", { name: "Throw to crib" });
      const cards = screen.queryByLabelText("Your hand")
        ? hand()
            .queryAllByRole("button")
            .filter((b) => !b.hasAttribute("disabled"))
        : [];
      if (next) await user.click(next);
      else if (cut) await user.click(cut);
      else if (ready) await user.click(ready);
      else if (throwBtn && cards.length >= 2) {
        if (throwBtn.hasAttribute("disabled")) {
          await user.click(cards[0]!);
          await user.click(cards[1]!);
        }
        await user.click(throwBtn);
      } else if (cards[0]) await user.click(cards[0]);
      else await new Promise((r) => setTimeout(r, 30));
    }
    const end = screen.getByRole("dialog", { name: /Victory|Defeat/ });
    expect(within(end).getByText(/121/)).toBeInTheDocument();
    // A guest earns nothing, but is told how to.
    expect(within(end).getByRole("link", { name: /^Sign in to earn/ })).toHaveAttribute(
      "href",
      "/login",
    );
  }, 60_000);

  it("cuts for the deal before the first hand", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/cribbage");
    render(<App botDelay={0} />);
    await user.click(screen.getByRole("button", { name: /set sail/i }));
    expect(screen.getByRole("heading", { name: "Cut for the deal" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Cut card/ }).length).toBeGreaterThanOrEqual(51);
    await cutForDeal(user);
    expect(screen.getAllByText(/cut low and deals? first/).length).toBeGreaterThan(0);
  });

  it("offers to resume a saved game", async () => {
    const user = await startGame("Classic");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: /Harbour/ }));
    await user.click(screen.getByRole("button", { name: /Resume/ }));
    expect(hand().getAllByRole("button")).toHaveLength(6);
  });
});

/**
 * The house and the computer play on from `s`, as the server does after your move, until you
 * have to act. Their steps, as you'd be sent them, if that ends the game with you winning.
 */
function computerFinishes(s: GameState, random: () => number): Step[] | null {
  const steps: Step[] = [];
  for (let i = 0; i < 100 && s.phase !== "gameOver"; i++) {
    const move =
      hostAction(s, () => shuffle(createDeck(), random)) ??
      (toAct(s).includes(0) ? null : botAction(s, 1, "easy", random));
    if (!move) break;
    const r = applyAction(s, move);
    s = r.state;
    steps.push({ events: r.events.map((e) => redactEvent(e, 0)), view: viewFor(s, 0) });
  }
  return s.phase === "gameOver" && s.winner === 0 ? steps : null;
}

/**
 * A seeded game vs the computer, played by bots up to the computer's turn to peg, where its next
 * moves end the game with you (seat 0) winning. That point, and the steps that finish it.
 */
function nearlyWon(): { start: GameState; finish: Step[] } {
  for (let seed = 1; seed < 200; seed++) {
    const random = seededRandom(seed);
    let s = newGame(CLASSIC_RULES);
    for (let i = 0; i < 5000 && s.phase !== "gameOver"; i++) {
      if (s.phase === "pegging" && toAct(s).join() === "1") {
        const finish = computerFinishes(s, seededRandom(seed));
        if (finish) return { start: s, finish };
      }
      const action =
        s.phase === "roundEnd"
          ? { type: "nextRound" as const }
          : (hostAction(s, () => shuffle(createDeck(), random)) ??
            botAction(s, 0, "easy", random) ??
            botAction(s, 1, "easy", random));
      s = applyAction(s, action!).state;
    }
  }
  throw new Error("No seeded game ends on the computer's move");
}

/** Stands in for the browser WebSocket the lobby opens; it never connects. */
class QuietSocket {
  static OPEN = 1;
  readyState = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  send() {}
  close() {}
}

describe("doubloons for a signed-in game vs the computer", () => {
  afterEach(() => vi.unstubAllGlobals());

  const reward: Reward = {
    lines: [
      { reason: "botWin", delta: 35 },
      { reason: "firstWinOfDay", delta: 50 },
    ],
    total: 85,
    balance: 85,
    note: null,
    unlocked: [],
  };

  /**
   * A signed-in player with no doubloons and a server whose games are a few moves from the end
   * (the computer is about to peg, and you win). Starts one and waits for the result.
   */
  async function winOnTheServer() {
    const { start, finish } = nearlyWon();
    let balance = 0;
    const me = (): User => ({
      id: "u1",
      username: "Anne",
      email: "anne@example.test",
      rating: 1000,
      rankedGames: 0,
      avatar: null,
      isAdmin: false,
      doubloons: balance,
    });
    const calls: string[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    vi.stubGlobal("WebSocket", QuietSocket);
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url === "/api/auth/me") return json({ user: me() });
      if (url === "/api/games/active") return json({ game: null });
      if (method === "POST" && url === "/api/games") {
        const res: GameResponse = {
          gameId: "g1",
          level: "medium",
          steps: [{ events: [], view: viewFor(start, 0) }],
        };
        return json(res);
      }
      // Your go-ahead lets the computer play on, and the game ends with what it paid.
      if (method === "POST" && url === "/api/games/g1/actions") {
        balance = reward.balance;
        const res: GameResponse = { gameId: "g1", level: "medium", steps: finish, reward };
        return json(res);
      }
      return json({ error: "Not found" }, 404);
    });

    const user = userEvent.setup();
    window.history.pushState({}, "", "/cribbage");
    render(<App botDelay={0} />);
    expect(await screen.findByTitle("Doubloons")).toHaveTextContent(/^0 doubloons$/);
    await user.click(screen.getByRole("button", { name: /set sail/i }));
    const end = await screen.findByRole("dialog", { name: "Victory!" }, { timeout: 5000 });
    return { user, end, calls };
  }

  it("shows what the win paid, and the new balance back in the harbour", async () => {
    const { user, end, calls } = await winOnTheServer();
    await waitFor(() => expect(end).toHaveTextContent("+85 doubloons"));
    expect(within(end).getByRole("list", { name: "Doubloons earned" })).toHaveTextContent(
      /Beat Bosun Barnaby\s*\+35\s*First win of the day\s*\+50/,
    );
    expect(within(end).queryByRole("link", { name: /Sign in to earn/ })).toBeNull();

    // Back in the harbour, the account bar has been read again and shows the new balance.
    await user.click(within(end).getByRole("button", { name: "Harbour" }));
    await waitFor(() => expect(screen.getByTitle("Doubloons")).toHaveTextContent(/^85 doubloons$/));
    expect(calls.filter((c) => c === "GET /api/auth/me")).toHaveLength(2);
  }, 30_000);

  it("reads the balance again on Play again too", async () => {
    const { user, end, calls } = await winOnTheServer();
    await user.click(within(end).getByRole("button", { name: "Play again" }));
    await waitFor(() => expect(calls.filter((c) => c === "POST /api/games")).toHaveLength(2));
    expect(calls.filter((c) => c === "GET /api/auth/me")).toHaveLength(2);
  }, 30_000);
});

describe("the shop", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is a link away from the harbour once it's open, for guests too", async () => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const items = SHOP_ITEMS.map(({ sort: _sort, ...i }) => ({ ...i, available: true }));
    vi.stubGlobal("fetch", async (url: string) =>
      url === "/api/auth/me"
        ? json({ user: null, shopOpen: true })
        : url === "/api/shop"
          ? json({ open: true, items })
          : json({ error: "Not found" }, 404),
    );
    const user = userEvent.setup();
    window.history.pushState({}, "", "/cribbage");
    render(<App />);
    await user.click(await screen.findByRole("link", { name: "Shop: boards and card backs" }));
    expect(window.location.pathname).toBe("/shop");
    expect(screen.getByRole("heading", { level: 1, name: "Shop" })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Treasure Map" })).toBeInTheDocument();
  });
});
