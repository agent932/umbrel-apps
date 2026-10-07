import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../auth.js";
import type { LedgerRow } from "../components/AdminDoubloons.js";
import { AdminScreen } from "./AdminScreen.js";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const ANNE = "00000000-0000-4000-8000-000000000002";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * A number as this machine's language writes it, with the plain spaces Testing Library compares
 * against (Finnish and French group thousands with a no-break space).
 */
const num = (n: number) => n.toLocaleString().replace(/\s/g, " ");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const person = (id: string, username: string, doubloons: number, isAdmin = false) => ({
  id,
  username,
  email: `${username.toLowerCase()}@example.test`,
  rating: 1000,
  tier: "Silver",
  rankedGames: 0,
  isAdmin,
  disabledAt: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  doubloons,
  matches: 3,
  online: false,
});

const ledgerRow = (i: number, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  id: `row-${i}`,
  delta: 35,
  reason: "botWin",
  ref: `match-${i}`,
  note: null,
  actor: null,
  createdAt: new Date(Date.UTC(2026, 9, 6, 12, 0, 0) - i * 60_000).toISOString(),
  ...extra,
});

interface Server {
  /** Every request, as "METHOD path". */
  calls: string[];
  /** The bodies of each doubloons adjustment, in order. */
  adjustments: { path: string; body: { delta: number; note: string; requestId: string } }[];
  /** How the next adjustment goes: its balance, or a failure. */
  next: (number | "offline" | { status: number; error: string })[];
}

/** The admin's server: overview, players, ledgers and adjustments. */
function stubServer(ledger: LedgerRow[] = [ledgerRow(0)]): Server {
  const server: Server = { calls: [], adjustments: [], next: [] };
  const players = [person(ADMIN, "Don", 40, true), person(ANNE, "Anne", 500)];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    server.calls.push(`${method} ${url}`);
    if (url === "/api/auth/me") return json({ user: { ...players[0], doubloons: 40 } });
    if (url === "/api/admin/overview")
      return json({
        players: 2,
        newPlayersThisWeek: 1,
        disabledPlayers: 0,
        matchesTotal: 12,
        matchesToday: { ai: 3 },
        liveOnlineGames: 0,
        liveBotGames: 1,
        doubloonsIssuedToday: 1234,
        topEarnersToday: [
          { id: ANNE, username: "Anne", doubloons: 935 },
          { id: ADMIN, username: "Don", doubloons: 299 },
        ],
        season: { id: 1, name: "Season 1", startedAt: "2026-09-01T00:00:00.000Z", endedAt: null },
        version: "abcdef1234",
        uptimeSeconds: 3600,
      });
    if (url.startsWith("/api/admin/users?")) return json({ users: players });
    if (url.endsWith("/ledger")) return json({ rows: ledger });
    if (method === "POST" && url.endsWith("/doubloons")) {
      server.adjustments.push({ path: url, body: JSON.parse(init.body as string) });
      const next = server.next.shift() ?? 0;
      if (next === "offline") throw new TypeError("Failed to fetch");
      if (typeof next === "object") return json({ error: next.error }, next.status);
      return json({ doubloons: next });
    }
    return json({ error: "Not found" }, 404);
  });
  return server;
}

function renderAdmin() {
  window.history.replaceState(null, "", "/admin");
  render(
    <AuthProvider>
      <AdminScreen />
    </AuthProvider>,
  );
}

/** Open the Players tab and a player's doubloons. */
async function openWallet(username: string) {
  const user = userEvent.setup();
  renderAdmin();
  await user.click(screen.getByRole("tab", { name: "Players" }));
  await user.click(await screen.findByRole("button", { name: `Doubloons for ${username}` }));
  return { user, sheet: screen.getByRole("dialog", { name: `${username}'s doubloons` }) };
}

/** Fill in the adjustment form and send it. */
async function adjust(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
  how: "Add" | "Remove",
  amount: string,
  why: string,
) {
  const s = within(sheet);
  await user.click(s.getByRole("radio", { name: how }));
  await user.clear(s.getByLabelText("How many doubloons"));
  if (amount) await user.type(s.getByLabelText("How many doubloons"), amount);
  await user.clear(s.getByLabelText(/^Why\?/));
  if (why) await user.type(s.getByLabelText(/^Why\?/), why);
  await user.click(s.getByRole("button", { name: `${how} doubloons` }));
}

afterEach(() => vi.unstubAllGlobals());

describe("admin: doubloons", () => {
  it("shows what was issued today and who earned the most", async () => {
    stubServer();
    renderAdmin();
    expect(await screen.findByText("Doubloons issued today")).toBeInTheDocument();
    expect(screen.getByText(num(1234))).toBeInTheDocument();
    const top = screen.getByRole("region", { name: "Top earners today" });
    expect(
      within(top)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([`1. Anne${num(935)} doubloons`, "2. Don299 doubloons"]);
  });

  it("lists each player's doubloons", async () => {
    stubServer();
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "Players" }));
    const anne = (await screen.findByText("Anne")).closest("tr")!;
    expect(screen.getByRole("columnheader", { name: "Doubloons" })).toBeInTheDocument();
    expect(within(anne).getByText("500")).toBeInTheDocument();
  });

  it("removes doubloons with a reason, and shows the new balance", async () => {
    const server = stubServer([
      ledgerRow(0),
      ledgerRow(1, { reason: "admin", delta: 100, ref: "x", note: "Welcome back", actor: "Don" }),
      ledgerRow(2, { reason: "achievement", delta: 50, ref: "firstWin" }),
      ledgerRow(3, { reason: "daily", delta: 25, ref: "2026-10-05" }),
    ]);
    server.next.push(450);
    const { user, sheet } = await openWallet("Anne");
    const history = await within(sheet).findByRole("list", { name: "Doubloon history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/Win vs the computer.*\+35/);
    expect(rows[1]).toHaveTextContent(/Adjustment.*by Don · Welcome back.*\+100/);
    expect(rows[2]).toHaveTextContent(/First Plunder.*\+50/);
    expect(rows[3]).toHaveTextContent(/Daily discard.*puzzle of 2026-10-05.*\+25/);

    await adjust(user, sheet, "Remove", "50", "refund");
    expect(server.adjustments).toHaveLength(1);
    expect(server.adjustments[0]!.path).toBe(`/api/admin/users/${ANNE}/doubloons`);
    expect(server.adjustments[0]!.body).toEqual({
      delta: -50,
      note: "refund",
      requestId: expect.stringMatching(UUID),
    });
    expect(await within(sheet).findByRole("status")).toHaveTextContent(
      "Done: −50 for Anne (balance now 450)",
    );
    expect(within(sheet).getByText("450")).toBeInTheDocument();
    // The players list shows it too, and the history is read again.
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(within(screen.getByText("Anne").closest("tr")!).getByText("450")).toBeInTheDocument();
    expect(server.calls.filter((c) => c.endsWith(`${ANNE}/ledger`))).toHaveLength(2);
  });

  it("sends nothing until the amount and the reason make sense", async () => {
    const server = stubServer();
    const { user, sheet } = await openWallet("Anne");
    for (const amount of ["abc", "0", "1.5", "100001", ""]) {
      await adjust(user, sheet, "Add", amount, "bonus");
      expect(within(sheet).getByRole("alert")).toHaveTextContent(
        `Enter a whole number from 1 to ${num(100_000)}`,
      );
    }
    await adjust(user, sheet, "Add", "10", "");
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Say why");
    expect(server.adjustments).toHaveLength(0);
  });

  it("retries a failed adjustment under the same request id, so it can't pay twice", async () => {
    const server = stubServer();
    server.next.push("offline", 600, 700);
    const { user, sheet } = await openWallet("Anne");
    await adjust(user, sheet, "Add", "100", "bonus");
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Couldn't reach the server");
    await user.click(within(sheet).getByRole("button", { name: "Add doubloons" }));
    expect(await within(sheet).findByRole("status")).toHaveTextContent("balance now 600");
    // A second, deliberate adjustment (even the same one) is a new request.
    await adjust(user, sheet, "Add", "100", "bonus");
    expect(await within(sheet).findByRole("status")).toHaveTextContent("balance now 700");
    const [first, retry, second] = server.adjustments.map((a) => a.body.requestId);
    expect(retry).toBe(first);
    expect(second).not.toBe(first);
  });

  it("starts a new request when a failed adjustment is changed", async () => {
    const server = stubServer();
    server.next.push({ status: 409, error: "That would take their doubloons below zero" }, 0);
    const { user, sheet } = await openWallet("Anne");
    await adjust(user, sheet, "Remove", "600", "mistake");
    expect(within(sheet).getByRole("alert")).toHaveTextContent("below zero");
    await adjust(user, sheet, "Remove", "500", "mistake");
    const [first, changed] = server.adjustments.map((a) => a.body.requestId);
    expect(changed).not.toBe(first);
  });

  it("lets an admin change their own balance, and reads it again for the account bar", async () => {
    const server = stubServer();
    server.next.push(140);
    const { user, sheet } = await openWallet("Don");
    await adjust(user, sheet, "Add", "100", "testing the shop");
    expect(await within(sheet).findByRole("status")).toHaveTextContent("balance now 140");
    expect(server.adjustments[0]!.path).toBe(`/api/admin/users/${ADMIN}/doubloons`);
    expect(server.calls.filter((c) => c === "GET /api/auth/me")).toHaveLength(2);
  });

  it("shows the last 50 changes", async () => {
    stubServer(Array.from({ length: 100 }, (_, i) => ledgerRow(i)));
    const { sheet } = await openWallet("Anne");
    const history = await within(sheet).findByRole("list", { name: "Doubloon history" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(50);
    expect(within(sheet).getByRole("heading", { name: "Last 50 changes" })).toBeInTheDocument();
  });
});
