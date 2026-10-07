import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { BotLevel, Reward, Seat } from "@pirate/engine";
import { resetTime } from "../../economy.js";
import { GameOverPanel } from "./GameOverPanel.js";

/** The panel on its own, props only: no AuthProvider (the game screen's tests have none). */
function renderPanel({
  winner = 0,
  reward,
  guest = false,
  level = "medium",
  ranked = true,
}: {
  winner?: Seat;
  reward?: Reward | null;
  guest?: boolean;
  level?: BotLevel | null;
  ranked?: boolean;
}) {
  return render(
    <GameOverPanel
      me={0}
      winner={winner}
      scores={winner === 0 ? [121, 84] : [84, 121]}
      skunk={0}
      show={[]}
      cut={null}
      names={["You", "Bosun Barnaby"]}
      ranked={ranked}
      instant
      reward={reward}
      guest={guest}
      level={level}
      onPlayAgain={() => {}}
      onExit={() => {}}
    />,
  );
}

const reward = (r: Partial<Reward>): Reward => ({
  lines: [],
  total: 0,
  balance: 0,
  note: null,
  unlocked: [],
  ...r,
});

/** Each line of a list, as read out. */
const items = (name: string) =>
  within(screen.getByRole("list", { name }))
    .getAllByRole("listitem")
    .map((li) => li.textContent!.replace(/\s+/g, " ").trim());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("doubloons at the end of a game", () => {
  it("adds up what a win paid, line by line, with each new achievement once", () => {
    renderPanel({
      reward: reward({
        lines: [
          { reason: "botWin", delta: 35 },
          { reason: "skunk", delta: 10 },
          { reason: "firstWinOfDay", delta: 50 },
          { reason: "achievement", delta: 50, key: "firstWin" },
        ],
        total: 145,
        balance: 145,
        unlocked: ["firstWin"],
      }),
    });
    const status = within(screen.getByRole("dialog", { name: "Victory!" })).getByRole("status");
    expect(status).toHaveTextContent("+145 doubloons");
    expect(items("Doubloons earned")).toEqual([
      "Beat Bosun Barnaby +35",
      "Skunk bonus +10",
      "First win of the day +50",
    ]);
    expect(items("New achievements")).toEqual(["New achievement: First Plunder +50"]);
    expect(screen.getAllByText("First Plunder")).toHaveLength(1);
  });

  it("lists an achievement a short game unlocked without paying for it, and says why", () => {
    renderPanel({ reward: reward({ note: "short", unlocked: ["firstWin"] }) });
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent(/\+\d/);
    expect(items("New achievements")).toEqual(["New achievement: First Plunder"]);
    expect(status).toHaveTextContent("Games under 4 rounds or 3 minutes don't pay doubloons.");
  });

  it("says when the daily bot bounty is reached, and when it resets", () => {
    renderPanel({ reward: reward({ note: "botCap" }) });
    // The reset time is in the player's own language and time zone, so build it the same way
    // (with plain spaces, as the text is compared).
    const text = `Daily bot bounty reached (10 wins). Online wins still pay. Resets at ${resetTime()}.`;
    expect(screen.getByRole("status")).toHaveTextContent(text.replace(/\s/g, " "));
  });

  it("says nothing about doubloons after a loss that paid nothing", () => {
    renderPanel({ winner: 1, reward: reward({}) });
    expect(screen.getByRole("dialog", { name: "Defeat…" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/doubloon/i);
  });

  it("doesn't ask the server for new achievements when the reward has them", () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({ achievements: [] })));
    vi.stubGlobal("fetch", fetch);
    const { unmount } = renderPanel({ reward: reward({}) });
    act(() => void vi.advanceTimersByTime(2000));
    expect(fetch).not.toHaveBeenCalled();
    unmount();
    // Without a reward (an older server), the panel still looks them up.
    renderPanel({ reward: null });
    act(() => void vi.advanceTimersByTime(2000));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/achievements"]);
  });
});

describe("guests", () => {
  it("names what a win would have paid, with a link to sign in", () => {
    renderPanel({ guest: true, ranked: false });
    const link = screen.getByRole("link", {
      name: "Sign in to earn 35 doubloons for wins like this",
    });
    expect(link).toHaveAttribute("href", "/login");
  });

  it("still points the way after a loss", () => {
    renderPanel({ winner: 1, guest: true, ranked: false });
    expect(screen.getByRole("link", { name: "Sign in to earn doubloons" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("shows nothing about doubloons in a signed-in player's tutorial", () => {
    renderPanel({ ranked: false, reward: undefined });
    expect(screen.getByRole("dialog", { name: "Victory!" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/doubloon/i);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
