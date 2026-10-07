import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cardLabel, dailyDeal } from "@pirate/engine";
import type { Reward } from "../api.js";
import { AuthProvider } from "../auth.js";
import { DailyDiscardScreen, bestStreak, today } from "./DailyDiscardScreen.js";

/** No server here, so the player is a guest. */
const Screen = () => (
  <AuthProvider>
    <DailyDiscardScreen />
  </AuthProvider>
);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

/** Throw the first two cards of today's hand. */
async function throwTwo() {
  const user = userEvent.setup();
  const cards = within(await screen.findByLabelText("Today's hand")).getAllByRole("button");
  await user.click(cards[0]!);
  await user.click(cards[1]!);
  await user.click(screen.getByRole("button", { name: "Throw to the crib" }));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * A signed-in player and the daily routes. The POST answers with `post` (given the day and cards
 * sent); GET /api/daily has no answer yet, or the one last thrown.
 */
function stubServer(post: (body: { day: string; cards: string[] }) => Response) {
  const calls: string[] = [];
  let thrown: { day: string; discard: string[]; best: boolean } | null = null;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push(`${method} ${url}`);
    if (url === "/api/auth/me")
      return json({
        user: { id: "u1", username: "Anne", email: "a@example.test", rating: 1000, rankedGames: 0 },
      });
    if (method === "POST" && url === "/api/daily") {
      const body = JSON.parse(init.body as string) as { day: string; cards: string[] };
      thrown = { day: body.day, discard: body.cards, best: false };
      return post(body);
    }
    if (url.startsWith("/api/daily")) return json({ result: thrown, streak: 0 });
    return json({ error: "Not found" }, 404);
  });
  return calls;
}

describe("daily discard", () => {
  it("counts days in a row with the best throw", () => {
    expect(
      bestStreak({ "2026-10-02": 100, "2026-10-03": 100, "2026-10-04": 100 }, "2026-10-04"),
    ).toBe(3);
    expect(bestStreak({ "2026-10-03": 100, "2026-10-04": 80 }, "2026-10-04")).toBe(0);
  });

  it("lets a guest throw two cards once, then shows how good the throw was", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Screen />);
    const cards = within(await screen.findByLabelText("Today's hand")).getAllByRole("button");
    expect(cards).toHaveLength(6);
    await user.click(cards[0]!);
    await user.click(cards[1]!);
    await user.click(screen.getByRole("button", { name: "Throw to the crib" }));
    expect(screen.getByRole("status")).toHaveTextContent(/out of 100|The best throw/);
    unmount();
    // Coming back the same day shows the result, not a fresh hand.
    render(<Screen />);
    await screen.findByLabelText("Today's hand");
    expect(screen.queryByRole("button", { name: "Throw to the crib" })).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("tells a guest that signing in pays doubloons for the daily discard", async () => {
    render(<Screen />);
    await throwTwo();
    const hint = screen.getByRole("link", { name: /^Sign in to earn doubloons/ });
    expect(hint).toHaveAccessibleName(
      "Sign in to earn doubloons: signed-in players get a different hand each day (10, or 25 for the best throw).",
    );
    expect(hint).toHaveAttribute("href", "/login");
  });

  /** The cards on the table, as labels ("5H"). */
  const shown = async () =>
    within(await screen.findByLabelText("Today's hand"))
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-card"));

  it("deals a guest a hand of their own, so its answer can't be used for the paid hand", async () => {
    render(<Screen />);
    const day = today();
    expect(await shown()).toEqual(dailyDeal(day, true).hand.map(cardLabel));
    expect(await shown()).not.toEqual(dailyDeal(day).hand.map(cardLabel));
  });

  it("deals a fresh hand when the throw saved today isn't from it", async () => {
    // Saved by an older version, when guests had the signed-in players' hand.
    const day = today();
    const old = dailyDeal(day).hand.map(cardLabel);
    const mine = dailyDeal(day, true).hand.map(cardLabel);
    const notMine = old.filter((c) => !mine.includes(c)).slice(0, 2);
    localStorage.setItem("pc.daily", JSON.stringify({ days: { [day]: 80 } }));
    localStorage.setItem(`pc.daily.${day}`, notMine.join(" "));
    render(<Screen />);
    expect(await shown()).toEqual(mine);
    expect(screen.getByRole("button", { name: "Throw to the crib" })).toBeInTheDocument();
  });
});

describe("daily discard doubloons, signed in", () => {
  it("shows what the throw paid, then reads the balance again", async () => {
    const reward: Reward = {
      lines: [{ reason: "daily", delta: 25, key: "best" }],
      total: 25,
      balance: 25,
      note: null,
      unlocked: [],
    };
    const calls = stubServer((body) =>
      json({
        result: { day: body.day, discard: body.cards, best: true },
        streak: 1,
        unlocked: [],
        reward,
      }),
    );
    render(<Screen />);
    await throwTwo();
    const lines = await screen.findByRole("list", { name: "Doubloons earned" });
    expect(lines.closest("[role=status]")).toHaveTextContent(/\+25 doubloons\s*Best throw\s*\+25/);
    expect(calls.filter((c) => c === "GET /api/auth/me")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Sign in to earn/ })).toBeNull();
  });

  it("lists a new achievement once, with what it paid", async () => {
    stubServer((body) =>
      json({
        result: { day: body.day, discard: body.cards, best: true },
        streak: 7,
        unlocked: ["sharpEye"],
        reward: {
          lines: [
            { reason: "daily", delta: 25, key: "best" },
            { reason: "achievement", delta: 150, key: "sharpEye" },
          ],
          total: 175,
          balance: 300,
          note: null,
          unlocked: ["sharpEye"],
        },
      }),
    );
    render(<Screen />);
    await throwTwo();
    const list = await screen.findByRole("list", { name: "New achievements" });
    expect(list).toHaveTextContent("New achievement: Sharp Eye +150");
    expect(screen.getAllByText("Sharp Eye")).toHaveLength(1);
  });

  it("pays nothing for a hand already thrown on another device", async () => {
    stubServer(() => json({ error: "You've already played that day's hand" }, 409));
    render(<Screen />);
    await throwTwo();
    expect(await screen.findByText(/out of 100|The best throw/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/doubloon/i);
  });
});
