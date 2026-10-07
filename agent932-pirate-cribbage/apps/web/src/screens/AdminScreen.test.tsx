import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

/** An item as GET /api/admin/shop lists it. */
const shopItem = (
  id: string,
  name: string,
  price: number,
  owners: number | null,
  extra: { isDefault?: boolean; available?: boolean } = {},
) => ({
  id,
  type: id.split(".")[0]!,
  name,
  price,
  isDefault: false,
  available: true,
  owners,
  ...extra,
});

const SHOP_LIST = [
  shopItem("board.serpent-reef", "Serpent Reef", 0, null, { isDefault: true }),
  shopItem("board.treasure-map", "Treasure Map", 1500, 2),
  shopItem("deck.cribbage-logo", "Pirate Cribbage", 0, null, { isDefault: true }),
  shopItem("deck.moon-compass", "Moon and Compass", 0, null),
  shopItem("deck.crimson", "Crimson", 1000, 1, { available: false }),
  shopItem("deck.ghost", "Ghost", 1000, 0),
];

interface Server {
  /** Every request, as "METHOD path". */
  calls: string[];
  /** The bodies of each doubloons adjustment, in order. */
  adjustments: { path: string; body: { delta: number; note: string; requestId: string } }[];
  /** How the next adjustment goes: its balance, or a failure. */
  next: (number | "offline" | { status: number; error: string })[];
  /** The shop switch as the server has it (a setting saved or not). */
  shop: { open: boolean; saved: boolean };
  /** The bodies posted to the shop switch, in order. */
  switches: unknown[];
  /** Failures for the next shop requests (GET or POST), in order; empty means they work. */
  shopFails: ("offline" | { status: number; error: string })[];
}

/** The admin's server: overview, players, ledgers and adjustments, and the shop. */
function stubServer(ledger: LedgerRow[] = [ledgerRow(0)]): Server {
  const server: Server = {
    calls: [],
    adjustments: [],
    next: [],
    shop: { open: false, saved: false },
    switches: [],
    shopFails: [],
  };
  const players = [person(ADMIN, "Don", 40, true), person(ANNE, "Anne", 500)];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    server.calls.push(`${method} ${url}`);
    if (url === "/api/auth/me")
      return json({ user: { ...players[0], doubloons: 40 }, shopOpen: server.shop.open });
    if (url === "/api/admin/shop") {
      if (method === "POST") server.switches.push(JSON.parse(init.body as string));
      const fail = server.shopFails.shift();
      if (fail === "offline") throw new TypeError("Failed to fetch");
      if (fail) return json({ error: fail.error }, fail.status);
      if (method === "GET") return json({ ...server.shop, items: SHOP_LIST });
      const { open } = server.switches.at(-1) as { open: boolean };
      server.shop = { open, saved: true };
      return json({ open });
    }
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
      ledgerRow(4, { reason: "daily", delta: 10, ref: "2026-10-04" }),
      ledgerRow(5, { reason: "skunk", delta: 25 }),
      ledgerRow(6, { reason: "skunk", delta: 10 }),
      // Half pay, in a 61-point game.
      ledgerRow(7, { reason: "skunk", delta: 13 }),
      ledgerRow(8, { reason: "skunk", delta: 5 }),
    ]);
    server.next.push(450);
    const { user, sheet } = await openWallet("Anne");
    const history = await within(sheet).findByRole("list", { name: "Doubloon history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/Win vs the computer.*\+35/);
    expect(rows[1]).toHaveTextContent(/Adjustment.*by Don · Welcome back.*\+100/);
    expect(rows[2]).toHaveTextContent(/First Plunder.*\+50/);
    // Named as on the player's result screen.
    expect(rows[3]).toHaveTextContent(/Best throw.*puzzle of 2026-10-05.*\+25/);
    expect(rows[4]).toHaveTextContent(/Daily discard.*puzzle of 2026-10-04.*\+10/);
    expect(rows.slice(5).map((r) => r.firstChild!.firstChild!.textContent)).toEqual([
      "Double skunk bonus",
      "Skunk bonus",
      "Double skunk bonus",
      "Skunk bonus",
    ]);

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

  it("names purchases by what they bought, and reasons this build doesn't know", async () => {
    stubServer([
      ledgerRow(0, { reason: "purchase", delta: -1500, ref: "board.treasure-map" }),
      // An item from a newer server, and a reason this build doesn't know.
      ledgerRow(1, { reason: "purchase", delta: -1000, ref: "deck.mermaid" }),
      ledgerRow(2, { reason: "refund" as LedgerRow["reason"], delta: 1000, ref: "x" }),
    ]);
    const { sheet } = await openWallet("Anne");
    const history = await within(sheet).findByRole("list", { name: "Doubloon history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(new RegExp(`^Bought Treasure Map.*−${num(1500)}$`));
    expect(within(rows[0]!).getByText(`−${num(1500)}`)).toHaveClass("text-red-300");
    expect(rows[1]).toHaveTextContent(new RegExp(`^Bought a shop item.*−${num(1000)}$`));
    expect(rows[2]).toHaveTextContent(new RegExp(`^Doubloons.*\\+${num(1000)}$`));
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

/** Open the Shop tab and wait for its list. */
async function openShop() {
  const user = userEvent.setup();
  renderAdmin();
  await user.click(screen.getByRole("tab", { name: "Shop" }));
  await screen.findByRole("table", { name: "Every item, on sale or not" });
  return user;
}

const CLOSED =
  /^The shop is closed to players\. Admins can preview it; items you use show only to you\.$/;
const meReads = (server: Server) => server.calls.filter((c) => c === "GET /api/auth/me").length;

describe("admin: the shop", () => {
  it("lists every item, on sale or not, with its type, price and owners", async () => {
    const server = stubServer();
    await openShop();
    const table = screen.getByRole("table", { name: "Every item, on sale or not" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Item", "Type", "Price", "Owners"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      ),
    ).toEqual([
      // Free items are everyone's, so there are no buyers to count.
      ["Serpent ReefDefaultboard.serpent-reef", "Board", "Free", "Everyone"],
      ["Treasure Mapboard.treasure-map", "Board", `${num(1500)} doubloons`, "2"],
      ["Pirate CribbageDefaultdeck.cribbage-logo", "Card back", "Free", "Everyone"],
      ["Moon and Compassdeck.moon-compass", "Card back", "Free", "Everyone"],
      // Taken off sale: still listed, with its owner.
      ["CrimsonOff saledeck.crimson", "Card back", `${num(1000)} doubloons`, "1"],
      ["Ghostdeck.ghost", "Card back", `${num(1000)} doubloons`, "0"],
    ]);
    // A fresh server: closed, and nothing saved yet. Nothing is sent just by looking.
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(screen.getByText(/^Not saved yet: closed by default\./)).toBeInTheDocument();
    expect(server.calls.filter((c) => c.endsWith("/api/admin/shop"))).toEqual([
      "GET /api/admin/shop",
    ]);
  });

  it("opens the shop only on the second press, then reads you again for your own links", async () => {
    const server = stubServer();
    server.shop = { open: false, saved: true };
    const user = await openShop();
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    // Saved already: nothing to save as closed.
    expect(screen.queryByText(/^Not saved yet/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save as closed" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open the shop to players" }));
    expect(server.switches).toEqual([]);
    const ask = screen.getByRole("group", { name: /^Open the shop to every player\?/ });
    // Focus is on the question, so it's read out; "Yes" is the next stop.
    expect(within(ask).getByText(/^Open the shop to every player\?/)).toHaveFocus();
    await user.tab();
    expect(within(ask).getByRole("button", { name: "Yes, open it" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText("The shop is open.")).toBeInTheDocument();
    expect(server.switches).toEqual([{ open: true }]);
    expect(screen.getByRole("status")).toHaveTextContent("The shop is open to players.");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.queryByRole("group")).toBeNull();
    // Focus moves to the switch, which now closes it.
    expect(screen.getByRole("button", { name: "Close the shop" })).toHaveFocus();
    // The account bar's Shop link loses its "(preview)".
    await waitFor(() => expect(meReads(server)).toBe(2));
  });

  it("asks before closing it too", async () => {
    const server = stubServer();
    server.shop = { open: true, saved: true };
    const user = await openShop();
    expect(screen.getByText("The shop is open.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close the shop" }));
    expect(server.switches).toEqual([]);
    expect(
      screen.getByRole("group", {
        name: /^Close the shop\? Players can't buy until it opens again/,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes, close it" }));
    expect(await screen.findByText(CLOSED)).toBeInTheDocument();
    expect(server.switches).toEqual([{ open: false }]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The shop is closed to players. They keep what they bought.",
    );
    expect(screen.getByRole("button", { name: "Open the shop to players" })).toHaveFocus();
    await waitFor(() => expect(meReads(server)).toBe(2));
  });

  it("doesn't take a double Enter on the switch as the second step", async () => {
    const server = stubServer();
    const user = await openShop();
    screen.getByRole("button", { name: "Open the shop to players" }).focus();
    await user.keyboard("{Enter}{Enter}");
    expect(screen.getByRole("button", { name: "Yes, open it" })).toBeInTheDocument();
    expect(server.switches).toEqual([]);
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
  });

  it("sends nothing when the second step is cancelled", async () => {
    const server = stubServer();
    const user = await openShop();
    await user.click(screen.getByRole("button", { name: "Open the shop to players" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(server.switches).toEqual([]);
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByRole("button", { name: "Open the shop to players" })).toHaveFocus();
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(meReads(server)).toBe(1);
  });

  it("saves the switch closed in one press while nothing is saved", async () => {
    const server = stubServer();
    const user = await openShop();
    await user.click(screen.getByRole("button", { name: "Save as closed" }));
    await waitFor(() => expect(screen.queryByText(/^Not saved yet/)).toBeNull());
    expect(server.switches).toEqual([{ open: false }]);
    expect(screen.getByRole("status")).toHaveTextContent("Saved as closed.");
    // Still closed; the button has gone, so focus moves to the switch.
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save as closed" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open the shop to players" })).toHaveFocus();
  });

  it("says why a switch failed, and changes nothing", async () => {
    const server = stubServer();
    server.shop = { open: false, saved: true };
    const user = await openShop();
    server.shopFails.push({ status: 403, error: "Admins only" }, "offline");

    await user.click(screen.getByRole("button", { name: "Open the shop to players" }));
    await user.click(screen.getByRole("button", { name: "Yes, open it" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Admins only"));
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Open the shop to players" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Open the shop to players" }));
    await user.click(screen.getByRole("button", { name: "Yes, open it" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the server"),
    );
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    // Nothing changed, so your own links are not read again.
    expect(meReads(server)).toBe(1);

    // The third try works.
    await user.click(screen.getByRole("button", { name: "Open the shop to players" }));
    await user.click(screen.getByRole("button", { name: "Yes, open it" }));
    expect(await screen.findByText("The shop is open.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(server.switches).toEqual([{ open: true }, { open: true }, { open: true }]);
  });

  it("keeps a failed Save as closed in place", async () => {
    const server = stubServer();
    const user = await openShop();
    server.shopFails.push("offline");
    const save = screen.getByRole("button", { name: "Save as closed" });
    await user.click(save);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the server"),
    );
    expect(screen.getByText(/^Not saved yet/)).toBeInTheDocument();
    expect(save).toBeInTheDocument();
    expect(save).toHaveFocus();
  });

  it("says when the list won't load, and Try again reads it again", async () => {
    const server = stubServer();
    server.shopFails.push({ status: 500, error: "Something broke" });
    const user = userEvent.setup();
    renderAdmin();
    await user.click(screen.getByRole("tab", { name: "Shop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the shop");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("table", { name: "Every item, on sale or not" }),
    ).toBeInTheDocument();
    expect(server.calls.filter((c) => c === "GET /api/admin/shop")).toHaveLength(2);
  });
});
