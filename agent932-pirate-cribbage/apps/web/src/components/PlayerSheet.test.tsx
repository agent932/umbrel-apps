import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerSheet } from "./PlayerSheet.js";

afterEach(() => vi.unstubAllGlobals());

/** A fake server: who's blocked, and every call made. */
function server(blocked: string[] = []) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: init.body && JSON.parse(String(init.body)),
    });
    if (url === "/api/blocks")
      return new Response(
        JSON.stringify({ blocked: blocked.map((username) => ({ id: username, username })) }),
      );
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

describe("PlayerSheet", () => {
  it("reports a player with a reason and a note", async () => {
    const calls = server();
    const user = userEvent.setup();
    render(<PlayerSheet username="Bonny" onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Report Bonny…" }));
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    await user.click(screen.getByLabelText("Offensive username"));
    await user.type(screen.getByLabelText(/Anything else/), "Rude name");
    await user.click(send);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "We look at every report within a day",
    );
    expect(calls.at(-1)).toEqual({
      url: "/api/players/Bonny/report",
      method: "POST",
      body: { reason: "name", note: "Rude name" },
    });
  });

  it("blocks after saying what blocking does, and tells the list", async () => {
    const calls = server();
    const onBlockedChange = vi.fn();
    const user = userEvent.setup();
    render(<PlayerSheet username="Bonny" onClose={() => {}} onBlockedChange={onBlockedChange} />);
    await user.click(await screen.findByRole("button", { name: "Block Bonny…" }));
    expect(screen.getByText(/won't be matched with Bonny again/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Block Bonny" }));
    expect(await screen.findByRole("status")).toHaveTextContent("You've blocked Bonny");
    expect(calls.at(-1)).toMatchObject({ url: "/api/players/Bonny/block", method: "POST" });
    expect(onBlockedChange).toHaveBeenCalledWith(true);
  });

  it("offers to unblock someone already blocked", async () => {
    const calls = server(["Bonny"]);
    const user = userEvent.setup();
    render(<PlayerSheet username="Bonny" onClose={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Unblock Bonny" }));
    expect(calls.at(-1)).toMatchObject({ url: "/api/players/Bonny/block", method: "DELETE" });
    expect(await screen.findByRole("button", { name: "Block Bonny…" })).toBeInTheDocument();
  });
});
