import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ShopResponse, User } from "../api.js";
import { AuthProvider } from "../auth.js";
import { AccountScreen } from "./AccountScreen.js";

const person = (isAdmin = false): User => ({
  id: "u1",
  username: "Anne",
  email: "anne@example.test",
  rating: 1000,
  rankedGames: 0,
  avatar: null,
  isAdmin,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** The account page, with the shop open or not, and what GET /api/shop says you own. */
function renderAccount(user: User, shopOpen: boolean, shop: ShopResponse | 404 = NOT_YET) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url === "/api/auth/me") return json({ user, shopOpen });
    if (url === "/api/shop") return shop === 404 ? json({ error: "Not found" }, 404) : json(shop);
    if (url === "/api/blocks") return json({ blocked: [] });
    if (url === "/api/email/enabled") return json({ enabled: false });
    return json({ error: "Not found" }, 404);
  });
  const { hook } = memoryLocation({ path: "/account" });
  render(
    <Router hook={hook}>
      <AuthProvider>
        <AccountScreen />
      </AuthProvider>
    </Router>,
  );
  return calls;
}

/** The closed shop's answer: what you own, which you can still switch between. */
const owning = (...owned: string[]): ShopResponse => ({
  open: false,
  items: [],
  owned,
  equipped: { board: "board.serpent-reef", deck: "deck.cribbage-logo" },
});
const NOT_YET = owning("board.serpent-reef", "deck.cribbage-logo", "deck.moon-compass");

const LINK = { name: "Boards and card backs" };

afterEach(() => vi.unstubAllGlobals());

describe("the account page's link to your boards and card backs", () => {
  it("shows while the shop is open, with no need to ask what you own", async () => {
    const calls = renderAccount(person(), true);
    expect(await screen.findByRole("link", LINK)).toHaveAttribute("href", "/shop");
    expect(calls).not.toContain("/api/shop");
  });

  it("shows admins while the shop is closed (their preview)", async () => {
    renderAccount(person(true), false);
    expect(await screen.findByRole("link", LINK)).toHaveAttribute("href", "/shop");
  });

  it("shows while the shop is closed when you own more than one back", async () => {
    renderAccount(person(), false);
    expect(await screen.findByRole("link", LINK)).toHaveAttribute("href", "/shop");
  });

  it("shows while the shop is closed when you own more than one board", async () => {
    renderAccount(
      person(),
      false,
      owning("board.serpent-reef", "board.treasure-map", "deck.cribbage-logo"),
    );
    expect(await screen.findByRole("link", LINK)).toBeInTheDocument();
  });

  it("is left out when there's nothing to choose between", async () => {
    const calls = renderAccount(
      person(),
      false,
      // A type this build doesn't know isn't a choice either.
      owning("board.serpent-reef", "deck.cribbage-logo", "pegs.brass", "pegs.gold"),
    );
    await waitFor(() => expect(calls).toContain("/api/shop"));
    expect(await screen.findByRole("heading", { name: "Change password" })).toBeInTheDocument();
    expect(screen.queryByRole("link", LINK)).toBeNull();
  });

  it("is left out on a server without the shop", async () => {
    const calls = renderAccount(person(), false, 404);
    await waitFor(() => expect(calls).toContain("/api/shop"));
    expect(screen.queryByRole("link", LINK)).toBeNull();
  });
});
