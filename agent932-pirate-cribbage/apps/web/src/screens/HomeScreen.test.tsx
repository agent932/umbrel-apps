import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { User } from "../api.js";
import { AuthProvider } from "../auth.js";
import { HomeScreen } from "./HomeScreen.js";

const person = (isAdmin = false): User => ({
  id: "u1",
  username: "Anne",
  email: "anne@example.test",
  rating: 1000,
  rankedGames: 0,
  avatar: null,
  isAdmin,
});

/** The harbour, for this user (or a guest), with the shop open or not. */
async function renderHarbour(user: User | null, shopOpen: boolean) {
  vi.stubGlobal(
    "fetch",
    async () => new Response(JSON.stringify({ user, shopOpen }), { status: 200 }),
  );
  const { hook } = memoryLocation({ path: "/cribbage" });
  render(
    <Router hook={hook}>
      <AuthProvider>
        <HomeScreen canResume={false} onResume={() => {}} onLearn={() => {}} onStart={() => {}} />
      </AuthProvider>
    </Router>,
  );
  // The account bar says who's here once /api/auth/me has answered.
  await screen.findByRole("link", { name: user ? "Account" : "Log in" });
}

const SHOP = /^Shop/;

afterEach(() => vi.unstubAllGlobals());

describe("the harbour's shop link", () => {
  it("shows once the shop is open, after the daily discard", async () => {
    await renderHarbour(person(), true);
    const shop = screen.getByRole("link", { name: "Shop: boards and card backs" });
    expect(shop).toHaveAttribute("href", "/shop");
    const daily = screen.getByRole("link", { name: /^Daily discard/ });
    expect(daily.nextElementSibling).toBe(shop);
  });

  it("shows guests the open shop too", async () => {
    await renderHarbour(null, true);
    expect(screen.getByRole("link", { name: "Shop: boards and card backs" })).toBeInTheDocument();
  });

  it("is hidden from players while the shop is closed", async () => {
    await renderHarbour(person(), false);
    expect(screen.queryByRole("link", { name: SHOP })).toBeNull();
  });

  it("is hidden from guests while the shop is closed", async () => {
    await renderHarbour(null, false);
    expect(screen.queryByRole("link", { name: SHOP })).toBeNull();
  });

  it("shows admins a preview while it's closed", async () => {
    await renderHarbour(person(true), false);
    expect(
      screen.getByRole("link", { name: "Shop (preview): boards and card backs" }),
    ).toHaveAttribute("href", "/shop");
  });
});
