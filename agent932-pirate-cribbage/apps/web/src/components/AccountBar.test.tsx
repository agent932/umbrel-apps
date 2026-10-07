import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { User } from "../api.js";
import { AuthProvider, useAuth } from "../auth.js";
import { AccountBar } from "./AccountBar.js";

const player = (doubloons?: number): User => ({
  id: "u1",
  username: "Anne",
  email: "anne@example.test",
  rating: 1000,
  rankedGames: 0,
  avatar: null,
  isAdmin: false,
  ...(doubloons !== undefined && { doubloons }),
});

/** /api/auth/me answers with each of these in turn (the last one from then on). */
function stubMe(...users: User[]) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    const user = users[Math.min(calls.length, users.length) - 1];
    return new Response(JSON.stringify({ user }), { status: 200 });
  });
  return calls;
}

/** Stands in for a game or the daily discard re-reading the player once it has paid. */
function Earn() {
  const { refresh } = useAuth();
  return (
    <button type="button" onClick={() => void refresh()}>
      Earn
    </button>
  );
}

function renderBar() {
  const { hook } = memoryLocation({ path: "/cribbage" });
  render(
    <Router hook={hook}>
      <AuthProvider>
        <AccountBar />
        <Earn />
      </AuthProvider>
    </Router>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("doubloons in the account bar", () => {
  it("shows the signed-in player's balance, read out as doubloons", async () => {
    stubMe(player(85));
    renderBar();
    const coins = await screen.findByTitle("Doubloons");
    expect(coins).toHaveTextContent("85 doubloons");
    // The word is for screen readers; the coin says it on screen.
    expect(screen.getByText("doubloons")).toHaveClass("sr-only");
  });

  it("shows 0 when the server doesn't send a balance", async () => {
    stubMe(player());
    renderBar();
    expect(await screen.findByTitle("Doubloons")).toHaveTextContent(/^0 doubloons$/);
  });

  it("shows the new balance once the player is read again after earning", async () => {
    const calls = stubMe(player(85), player(120));
    renderBar();
    expect(await screen.findByTitle("Doubloons")).toHaveTextContent("85");
    await userEvent.click(screen.getByRole("button", { name: "Earn" }));
    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(calls).toEqual(["/api/auth/me", "/api/auth/me"]);
  });

  it("shows no balance to guests", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    renderBar();
    expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByTitle("Doubloons")).toBeNull();
  });
});

describe("the shop link", () => {
  /** /api/auth/me answers with this user (or a guest) and the shop switch. */
  function stubAuth(user: User | null, shopOpen: boolean) {
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ user, shopOpen }), { status: 200 }),
    );
  }
  const links = () =>
    within(screen.getByRole("navigation", { name: "Account" }))
      .getAllByRole("link")
      .map((a) => a.textContent);

  it("shows once the shop is open, before Crew, and leaves the balance as it was", async () => {
    stubAuth(player(85), true);
    renderBar();
    expect(await screen.findByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
    expect(links()).toEqual(["Shop", "Crew", "Ship's Log", "Account"]);
    expect(screen.getByTitle("Doubloons")).toHaveTextContent(/^85 doubloons$/);
  });

  it("is hidden from players while the shop is closed", async () => {
    stubAuth(player(85), false);
    renderBar();
    expect(await screen.findByTitle("Doubloons")).toBeInTheDocument();
    expect(links()).toEqual(["Crew", "Ship's Log", "Account"]);
  });

  it("shows admins a preview while the shop is closed, and the shop once it's open", async () => {
    stubAuth({ ...player(85), isAdmin: true }, false);
    renderBar();
    expect(await screen.findByRole("link", { name: "Shop (preview)" })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(links()).toEqual(["Admin", "Shop (preview)", "Crew", "Ship's Log", "Account"]);
  });

  it("shows admins the plain link once the shop is open", async () => {
    stubAuth({ ...player(85), isAdmin: true }, true);
    renderBar();
    expect(await screen.findByRole("link", { name: "Shop" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Shop (preview)" })).toBeNull();
  });

  it("shows guests the open shop, before Log in", async () => {
    stubAuth(null, true);
    renderBar();
    expect(await screen.findByRole("link", { name: "Shop" })).toBeInTheDocument();
    expect(links()).toEqual(["Shop", "Log in", "Sign up"]);
  });

  it("is hidden from guests while the shop is closed", async () => {
    stubAuth(null, false);
    renderBar();
    expect(await screen.findByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(links()).toEqual(["Log in", "Sign up"]);
  });
});
