/**
 * The real web app against the real server (in-memory Postgres): fetch is routed straight into
 * Fastify, with a cookie jar, so sign-up, server games and stats all run end to end.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { testApp } from "../../server/src/test/testApp.js";
import { App } from "./App.js";

let server: Awaited<ReturnType<typeof testApp>>;
let cookie = "";

/** This test doesn't cover online play; a silent socket keeps the challenge listener quiet. */
class SilentSocket {
  static OPEN = 1;
  readyState = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  send() {}
  close() {}
}

beforeAll(async () => {
  vi.stubGlobal("WebSocket", SilentSocket);
  server = await testApp();
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const res = await server.app.inject({
      method: (init.method ?? "GET") as "GET",
      url: String(input),
      payload: init.body as string | undefined,
      headers: { ...(init.headers as Record<string, string>), cookie },
    });
    const set = res.cookies.find((c) => c.name === "pc_session");
    if (set) cookie = set.value ? `pc_session=${set.value}` : "";
    return new Response(res.body || null, {
      status: res.statusCode,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await server.close();
});

describe("signed-in play, end to end", () => {
  it("signs up, plays a server game to the end, and sees it in the Ship's Log", async () => {
    window.history.replaceState(null, "", "/signup");
    const user = userEvent.setup();
    render(<App botDelay={0} />);

    await user.type(await screen.findByLabelText("Username"), "CaroS");
    await user.type(screen.getByLabelText("Email"), "caros@example.test");
    await user.type(screen.getByLabelText("Password"), "parrots-and-rum");
    await user.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("CaroS")).toBeInTheDocument();
    expect(screen.getByText(/counts toward your Ship's Log/)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Easy/));
    await user.click(screen.getByLabelText(/^Classic/));
    await user.click(screen.getByRole("button", { name: /set sail/i }));
    const hand = () => within(screen.getByLabelText("Your hand"));
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));

    for (let i = 0; i < 600; i++) {
      if (screen.queryByRole("dialog", { name: /Victory|Defeat/ })) break;
      const next = screen.queryByRole("button", { name: "Next round" });
      const cut = screen.queryByRole("button", { name: "Cut the deck" });
      const throwBtn = screen.queryByRole("button", { name: "Throw to crib" });
      const cards = screen.queryByLabelText("Your hand")
        ? hand()
            .queryAllByRole("button")
            .filter((b) => !b.hasAttribute("disabled"))
        : [];
      if (next) await user.click(next);
      else if (cut) await user.click(cut);
      else if (throwBtn && cards.length >= 2) {
        if (throwBtn.hasAttribute("disabled")) {
          await user.click(cards[0]!);
          await user.click(cards[1]!);
        }
        await user.click(throwBtn);
      } else if (cards[0]) await user.click(cards[0]);
      else await new Promise((r) => setTimeout(r, 20));
    }
    const end = screen.getByRole("dialog", { name: /Victory|Defeat/ });
    expect(within(end).getByText(/121/)).toBeInTheDocument();

    await user.click(within(end).getByRole("button", { name: "Harbour" }));
    await user.click(await screen.findByRole("link", { name: "Ship's Log" }));
    const [table] = await screen.findAllByRole("table");
    const row = within(table!).getByText("Matches played").closest("tr")!;
    // Columns: Stat, Easy, Medium, Hard, Online, All.
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("1");
    expect(cells[5]).toHaveTextContent("1");
    expect(screen.getByRole("img", { name: "Your hand scores" })).toBeInTheDocument();
  }, 120_000);
});
