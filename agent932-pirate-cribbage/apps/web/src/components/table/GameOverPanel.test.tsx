import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import type { BotLevel, Reward, Seat } from "@pirate/engine";
import { resetTime } from "../../economy.js";
import type { OnlineInfo } from "../../game/types.js";
import { GameOverPanel } from "./GameOverPanel.js";

/** The panel on its own, props only: no AuthProvider (the game screen's tests have none). */
function renderPanel({
  winner = 0,
  reward,
  guest = false,
  tutorial = false,
  level = "medium",
  ranked = true,
  online,
}: {
  winner?: Seat;
  reward?: Reward | null;
  guest?: boolean;
  tutorial?: boolean;
  level?: BotLevel | null;
  ranked?: boolean;
  online?: OnlineInfo;
}) {
  return render(
    <GameOverPanel
      me={0}
      winner={winner}
      scores={winner === 0 ? [121, 84] : [84, 121]}
      skunk={0}
      show={[]}
      cut={null}
      names={["You", online ? "Bonny" : "Bosun Barnaby"]}
      online={online}
      ranked={ranked}
      instant
      reward={reward}
      guest={guest}
      tutorial={tutorial}
      level={online ? null : level}
      onPlayAgain={() => {}}
      onExit={() => {}}
    />,
  );
}

/** An online game that `forfeitedBy` abandoned. */
const forfeited = (forfeitedBy: Seat): OnlineInfo => ({
  deadline: null,
  online: [true, false],
  avatars: [null, null],
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
  forfeitedBy,
});

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

  it("lists an achievement that paid nothing without an amount, and says why the win didn't pay", () => {
    renderPanel({ reward: reward({ note: "short", unlocked: ["firstWin"] }) });
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent(/\+\d/);
    expect(items("New achievements")).toEqual(["New achievement: First Plunder"]);
    expect(status).toHaveTextContent("Games under 4 rounds or 3 minutes pay no win bounty.");
  });

  it("says only the win paid nothing when an achievement in a short game paid", () => {
    renderPanel({
      reward: reward({
        lines: [{ reason: "achievement", delta: 50, key: "power:spyglass" }],
        total: 50,
        balance: 50,
        note: "short",
        unlocked: ["power:spyglass"],
      }),
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("+50 doubloons");
    expect(items("New achievements")).toEqual([expect.stringMatching(/Spyglass.*\+50$/)]);
    expect(status).toHaveTextContent("Games under 4 rounds or 3 minutes pay no win bounty.");
    expect(status).not.toHaveTextContent(/don't pay doubloons|no doubloons/);
  });

  it("says a forfeit paid half without saying the opponent left twice", () => {
    renderPanel({
      online: forfeited(1),
      ranked: false,
      reward: reward({
        lines: [{ reason: "onlineWin", delta: 25 }],
        total: 25,
        balance: 25,
        note: "lateForfeit",
      }),
    });
    expect(screen.getAllByText(/abandoned ship/)).toHaveLength(1);
    expect(screen.getByText("Bonny abandoned ship.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Half bounty for a forfeit win.");
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

  it("promises no amount after the tutorial, which pays nothing even when signed in", () => {
    renderPanel({ guest: true, tutorial: true, ranked: false, level: "easy" });
    expect(screen.getByRole("link", { name: "Sign in to earn doubloons" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(document.body).not.toHaveTextContent(/wins like this/);
  });

  it("shows nothing about doubloons in a signed-in player's tutorial", () => {
    renderPanel({ ranked: false, reward: undefined });
    expect(screen.getByRole("dialog", { name: "Victory!" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/doubloon/i);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
