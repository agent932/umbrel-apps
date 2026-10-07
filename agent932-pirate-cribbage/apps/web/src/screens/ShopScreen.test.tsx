import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DEFAULT_COSMETICS, SHOP_ITEMS } from "@pirate/engine";
import type { ShopItem, ShopResponse, User } from "../api.js";
import { AuthProvider } from "../auth.js";
import { ShopScreen } from "./ShopScreen.js";

/** Whether the page thinks it's in the iPhone app (read each time, so a test can flip it). */
const native = vi.hoisted(() => ({ app: false }));
vi.mock("../native.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../native.js")>();
  return {
    ...real,
    get isNativeApp() {
      return native.app;
    },
  };
});

/** Every pair the shop asked to have its art fetched for. */
const preloaded = vi.hoisted(() => [] as { board: string; deck: string }[]);
vi.mock("../brand/preloadSkins.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../brand/preloadSkins.js")>();
  return {
    ...real,
    preloadCosmetics: (pair: { board: string; deck: string }) => {
      preloaded.push(pair);
      return real.preloadCosmetics(pair);
    },
  };
});

/**
 * A number as this machine's language writes it, with the plain spaces Testing Library compares
 * against (Finnish and French group thousands with a no-break space).
 */
const num = (n: number) => n.toLocaleString().replace(/\s/g, " ");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const person = (username: string, isAdmin = false): User => ({
  id: `id-${username}`,
  username,
  email: `${username.toLowerCase()}@example.test`,
  rating: 1000,
  rankedGames: 0,
  avatar: null,
  isAdmin,
  equippedBoard: null,
  equippedDeck: null,
});

/** The catalog as GET /api/shop sends it. */
const ITEMS: ShopItem[] = SHOP_ITEMS.map(({ sort: _sort, ...item }) => ({
  ...item,
  available: true,
}));
const FREE = ITEMS.filter((i) => i.price === 0).map((i) => i.id);
const item = (id: string) => ITEMS.find((i) => i.id === id)!;

/**
 * How a request goes instead of working: the server's error, no connection at all, or "lost": the
 * server does it, but its reply never arrives.
 */
type Failure = "offline" | "lost" | { status: number; error: string; code?: string };
type Route = "me" | "shop" | "buy" | "use";

interface Server {
  /** Every request, as "METHOD path". */
  calls: string[];
  /** What was posted to buy and use, in order. */
  posts: { path: string; body: { itemId: string; price?: number } }[];
  /** Failures to answer the next requests on each route with (then they work again). */
  next: Record<Route, Failure[]>;
  /** Requests on each route that wait until the test lets them go (see hold). */
  held: Record<Route, Promise<void>[]>;
  /** The shop as the server holds it: buying and using change it. */
  state: ShopResponse;
}

/** The shop's server, for a signed-in player (Anne, 2,500 doubloons, shop open) unless told. */
function stubServer({
  user = person("Anne"),
  shop = {},
}: { user?: User | null; shop?: Partial<ShopResponse> } = {}): Server {
  const state: ShopResponse = user
    ? {
        open: true,
        items: ITEMS,
        doubloons: 2500,
        owned: FREE,
        equipped: DEFAULT_COSMETICS,
        ...shop,
      }
    : { open: true, items: ITEMS, ...shop };
  const server: Server = {
    calls: [],
    posts: [],
    next: { me: [], shop: [], buy: [], use: [] },
    held: { me: [], shop: [], buy: [], use: [] },
    state,
  };
  const routes: Record<string, Route> = {
    "GET /api/auth/me": "me",
    "GET /api/shop": "shop",
    "POST /api/shop/buy": "buy",
    "POST /api/shop/use": "use",
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const call = `${init.method ?? "GET"} ${url}`;
    server.calls.push(call);
    const route = routes[call];
    if (!route) return json({ error: "Not found" }, 404);
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    if (route === "buy" || route === "use") server.posts.push({ path: url, body });
    const wait = server.held[route].shift();
    if (wait) await wait;
    const fail = server.next[route].shift();
    if (fail === "offline") throw new TypeError("Failed to fetch");
    if (fail && fail !== "lost") return json({ error: fail.error, code: fail.code }, fail.status);
    const reply = answer(route, body);
    if (fail === "lost") throw new TypeError("Failed to fetch");
    return reply;
  });
  function answer(route: Route, body: { itemId: string }) {
    switch (route) {
      case "me":
        return json({
          user: user && { ...user, doubloons: state.doubloons },
          shopOpen: state.open,
        });
      case "shop":
        return json(state);
      case "buy": {
        const bought = state.items.find((i) => i.id === body.itemId)!;
        state.doubloons = state.doubloons! - bought.price;
        state.owned = [...state.owned!, bought.id];
        return json({ doubloons: state.doubloons, owned: state.owned });
      }
      case "use": {
        const used = state.items.find((i) => i.id === body.itemId)!;
        state.equipped = { ...state.equipped!, [used.type]: used.id };
        return json({ equipped: state.equipped });
      }
    }
  }
  return server;
}

/** Hold the next request on a route until the test lets it go; then it's answered as usual. */
function hold(server: Server, route: Route) {
  let release!: () => void;
  server.held[route].push(new Promise<void>((resolve) => (release = resolve)));
  return release;
}

function renderShop() {
  const { hook } = memoryLocation({ path: "/shop" });
  render(
    <Router hook={hook}>
      <AuthProvider>
        <ShopScreen />
      </AuthProvider>
    </Router>,
  );
  return userEvent.setup();
}

/** An item's card, once the shop has loaded. */
const card = (name: string) => screen.findByRole("article", { name });

/** Open Treasure Map's confirm sheet. */
async function openSheet(user: ReturnType<typeof userEvent.setup>, name = "Treasure Map") {
  const buy = within(await card(name)).getByRole("button", { name: /^Buy / });
  await user.click(buy);
  return { buy, sheet: screen.getByRole("dialog", { name: `Buy ${name}?` }) };
}

const count = (server: Server, call: string) => server.calls.filter((c) => c === call).length;

/** The page's "Shop" heading. */
const heading = () => screen.getByRole("heading", { level: 1, name: "Shop" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  native.app = false;
  preloaded.length = 0;
});

describe("the shop", () => {
  it("shows your balance, every item with its price, and how doubloons are earned", async () => {
    stubServer();
    renderShop();
    expect(await screen.findByText(`You have ${num(2500)} doubloons`)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Doubloons are earned by playing: wins, the daily discard and achievements. They can't be bought, and nothing here costs real money.",
      ),
    ).toBeInTheDocument();
    for (const i of ITEMS) {
      const c = await card(i.name);
      expect(c).toHaveTextContent(i.description);
      expect(c).toHaveTextContent(i.price ? `${num(i.price)} doubloons` : "Free");
    }
    // Boards, then card backs, each under its own heading.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Boards",
      "Card backs",
    ]);
    // What each button does, in full.
    const button = async (name: string) => within(await card(name)).getByRole("button");
    expect(await button("Serpent Reef")).toHaveAccessibleName("In use: Serpent Reef");
    expect(await button("Serpent Reef")).toHaveAttribute("aria-disabled", "true");
    expect(await button("Pirate Cribbage")).toHaveAccessibleName("In use: Pirate Cribbage");
    expect(await button("Moon and Compass")).toHaveAccessibleName("Use it: Moon and Compass");
    expect(await button("Treasure Map")).toHaveAccessibleName(
      `Buy Treasure Map for ${num(1500)} doubloons`,
    );
    expect(await button("Crimson")).toHaveAccessibleName(`Buy Crimson for ${num(1000)} doubloons`);
    expect(await button("Crimson")).not.toHaveAttribute("aria-disabled");
    // Each card shows the item itself: the board, or the back.
    expect((await card("Treasure Map")).querySelector("svg")).toHaveAttribute(
      "data-skin",
      "treasure-map",
    );
    expect((await card("Crimson")).querySelector("img")).toHaveAttribute("data-deck", "crimson");
  });

  it("says how many more doubloons an item needs, and won't open the sheet", async () => {
    stubServer({ shop: { doubloons: 900 } });
    const user = renderShop();
    const buy = within(await card("Treasure Map")).getByRole("button");
    expect(buy).toHaveAccessibleName(`Buy Treasure Map for ${num(1500)} doubloons`);
    expect(buy).toHaveAttribute("aria-disabled", "true");
    expect(buy).not.toBeDisabled();
    expect(buy).toHaveAccessibleDescription("600 more doubloons needed");
    expect(within(await card("Crimson")).getByRole("button")).toHaveAccessibleDescription(
      "100 more doubloons needed",
    );
    await user.click(buy);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(buy).toHaveFocus();
  });

  it("asks once, buys at the price shown, and reads the account again", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    expect(sheet).toHaveTextContent(
      `${num(1500)} doubloons. You have ${num(2500)}, so you'll have ${num(1000)} left. Purchases can't be undone.`,
    );
    // The board again, larger.
    expect(sheet.querySelector("svg")).toHaveAttribute("data-skin", "treasure-map");
    const confirm = within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` });
    expect(confirm).toHaveFocus();
    await user.click(confirm);
    expect(await within(sheet).findByText("Treasure Map is yours.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Use it now" })).toHaveFocus();
    expect(sheet).toHaveTextContent(`You have ${num(1000)} doubloons left.`);
    expect(server.posts).toEqual([
      { path: "/api/shop/buy", body: { itemId: "board.treasure-map", price: 1500 } },
    ]);
    // Bought, not switched on; the account bar's balance is read again.
    expect(screen.getByText(`You have ${num(1000)} doubloons`)).toBeInTheDocument();
    expect(within(await card("Treasure Map")).getByRole("button")).toHaveAccessibleName(
      "Use it: Treasure Map",
    );
    await waitFor(() => expect(count(server, "GET /api/auth/me")).toBe(2));
  });

  it("uses it now, says so, and puts focus back on the card's button", async () => {
    const server = stubServer();
    const user = renderShop();
    const { buy, sheet } = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    await user.click(await within(sheet).findByRole("button", { name: "Use it now" }));
    expect(await screen.findByText("Treasure Map is now in use")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(server.posts.at(-1)).toEqual({
      path: "/api/shop/use",
      body: { itemId: "board.treasure-map" },
    });
    // The same button, now saying it's in use.
    expect(document.activeElement).toBe(buy);
    expect(buy).toHaveAccessibleName("In use: Treasure Map");
    expect(buy).toHaveAttribute("aria-disabled", "true");
    expect(within(await card("Serpent Reef")).getByRole("button")).toHaveAccessibleName(
      "Use it: Serpent Reef",
    );
    // And the tables you sit at next are told (the signed-in player is read again).
    await waitFor(() => expect(count(server, "GET /api/auth/me")).toBe(3));
  });

  it("closes after buying with focus on the card's button, now Use it", async () => {
    stubServer();
    const user = renderShop();
    const { buy, sheet } = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    await user.click(await within(sheet).findByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(buy);
    expect(buy).toHaveAccessibleName("Use it: Treasure Map");
  });

  it("uses an item from its card, keeping focus on that button", async () => {
    const server = stubServer();
    const user = renderShop();
    const use = within(await card("Moon and Compass")).getByRole("button");
    await user.click(use);
    expect(await screen.findByText("Moon and Compass is now in use")).toBeInTheDocument();
    expect(server.posts).toEqual([
      { path: "/api/shop/use", body: { itemId: "deck.moon-compass" } },
    ]);
    expect(document.activeElement).toBe(use);
    expect(use).toHaveAccessibleName("In use: Moon and Compass");
    expect(within(await card("Pirate Cribbage")).getByRole("button")).toHaveAccessibleName(
      "Use it: Pirate Cribbage",
    );
  });

  it("says why a switch failed", async () => {
    const server = stubServer();
    server.next.use.push("offline");
    const user = renderShop();
    const use = within(await card("Moon and Compass")).getByRole("button");
    await user.click(use);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the shop. Try again."),
    );
    expect(use).toHaveAccessibleName("Use it: Moon and Compass");
    expect(document.activeElement).toBe(use);
  });

  it("keeps Tab inside the sheet, past the board drawn in it", async () => {
    stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    const confirm = within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` });
    const cancel = within(sheet).getByRole("button", { name: "Cancel" });
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
  });

  it("closes on Escape and gives focus back", async () => {
    const server = stubServer();
    const user = renderShop();
    const { buy } = await openSheet(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(buy);
    // Cancel likewise.
    await user.click(buy);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(buy);
    expect(server.posts).toEqual([]);
  });

  it("shows a new price, and buys at it on a second confirm", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    // The price changes on the server before the player confirms.
    server.state.items = ITEMS.map((i) =>
      i.id === "board.treasure-map" ? { ...i, price: 1200 } : i,
    );
    server.next.buy.push({
      status: 409,
      error: `Treasure Map now costs ${num(1200)} doubloons`,
      code: "priceChanged",
    });
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      `The price is now ${num(1200)} doubloons.`,
    );
    expect(count(server, "GET /api/shop")).toBe(2);
    expect(sheet).toHaveTextContent(`so you'll have ${num(1300)} left`);
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1200)} doubloons` }));
    expect(await within(sheet).findByText("Treasure Map is yours.")).toBeInTheDocument();
    expect(server.posts.map((p) => p.body.price)).toEqual([1500, 1200]);
    expect(screen.getByText(`You have ${num(1300)} doubloons`)).toBeInTheDocument();
  });

  it("shows any other failure in the sheet, and reads the shop again", async () => {
    const server = stubServer();
    server.next.buy.push(
      { status: 409, error: "You already have Treasure Map", code: "owned" },
      "offline",
    );
    const user = renderShop();
    const { sheet } = await openSheet(user);
    const confirm = within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` });
    await user.click(confirm);
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "You already have Treasure Map",
    );
    expect(count(server, "GET /api/shop")).toBe(2);
    await user.click(confirm);
    await waitFor(() =>
      expect(within(sheet).getByRole("alert")).toHaveTextContent(
        "Couldn't reach the shop. Try again.",
      ),
    );
    expect(count(server, "GET /api/shop")).toBe(3);
    expect(screen.getByRole("dialog")).toBe(sheet);
  });

  it("still says it's yours when the account can't be read again", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    server.next.me.push("offline");
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    expect(await within(sheet).findByText("Treasure Map is yours.")).toBeInTheDocument();
    await waitFor(() => expect(count(server, "GET /api/auth/me")).toBe(2));
    expect(within(sheet).queryByRole("alert")).toBeNull();
  });

  it("says it's yours when the purchase went through but its reply was lost", async () => {
    const server = stubServer();
    server.next.buy.push("lost");
    const user = renderShop();
    const { sheet } = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    // The shop, read again, says it's owned: a success, not "Couldn't reach the shop".
    expect(await within(sheet).findByText("Treasure Map is yours.")).toBeInTheDocument();
    expect(within(sheet).queryByRole("alert")).toBeNull();
    expect(sheet).toHaveTextContent(`You have ${num(1000)} doubloons left.`);
    expect(within(sheet).getByRole("button", { name: "Use it now" })).toHaveFocus();
    expect(count(server, "GET /api/shop")).toBe(2);
    expect(server.posts).toHaveLength(1);
  });

  it("announces the purchase in a live region that was there all along, and names the sheet for it", async () => {
    stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    const status = within(sheet).getByRole("status");
    expect(status).toBeEmptyDOMElement();
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    await waitFor(() => expect(status).toHaveTextContent("Treasure Map is yours."));
    expect(within(sheet).getByRole("status")).toBe(status);
    expect(sheet).toHaveAccessibleName("Treasure Map is yours");
    // Focus lands on Use it now, which says it too.
    const useNow = within(sheet).getByRole("button", { name: "Use it now" });
    expect(useNow).toHaveFocus();
    expect(useNow).toHaveAccessibleDescription("Treasure Map is yours.");
  });

  it("says Buying… while it buys, sends it once, and can't be closed until it's done", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    const release = hold(server, "buy");
    const confirm = within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` });
    await user.click(confirm);
    // The same button, busy: never `disabled`, so it keeps focus.
    expect(confirm).toHaveAccessibleName("Buying…");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveFocus();
    // A second press sends nothing; Cancel and Escape leave it open, so nobody walks away from a
    // purchase that's going through.
    await user.click(confirm);
    const cancel = within(sheet).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    await user.click(cancel);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBe(sheet);
    release();
    expect(await within(sheet).findByText("Treasure Map is yours.")).toBeInTheDocument();
    expect(server.posts).toHaveLength(1);
  });

  it("says Switching… on a card while it switches, keeping focus, and sends it once", async () => {
    const server = stubServer();
    const user = renderShop();
    const use = within(await card("Moon and Compass")).getByRole("button");
    const release = hold(server, "use");
    await user.click(use);
    expect(use).toHaveAccessibleName("Switching to Moon and Compass…");
    expect(use).toHaveTextContent("Switching…");
    expect(use).toHaveAttribute("aria-disabled", "true");
    expect(use).toHaveAttribute("aria-busy", "true");
    expect(use).not.toBeDisabled();
    expect(use).toHaveFocus();
    await user.click(use);
    release();
    expect(await screen.findByText("Moon and Compass is now in use")).toBeInTheDocument();
    expect(server.posts).toEqual([
      { path: "/api/shop/use", body: { itemId: "deck.moon-compass" } },
    ]);
    expect(use).toHaveFocus();
  });

  it("fetches the art on Use it now, and says in the sheet why it couldn't switch", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    const useNow = await within(sheet).findByRole("button", { name: "Use it now" });
    const release = hold(server, "use");
    server.next.use.push("offline");
    await user.click(useNow);
    expect(useNow).toHaveTextContent("Switching…");
    expect(useNow).toHaveAttribute("aria-disabled", "true");
    expect(useNow).toHaveAttribute("aria-busy", "true");
    expect(useNow).not.toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Close" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // Its art is on its way already, so the next table opens on it.
    expect(preloaded).toContainEqual({ board: "board.treasure-map", deck: DEFAULT_COSMETICS.deck });
    release();
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Couldn't reach the shop. Try again.",
    );
    // Still bought, and Use it now can be tried again.
    expect(screen.getByRole("dialog")).toBe(sheet);
    expect(sheet).toHaveTextContent("Treasure Map is yours.");
    expect(useNow).toHaveTextContent("Use it now");
    expect(useNow).toHaveFocus();
  });

  it("closes the sheet when the shop closes, and says why with focus on the heading", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    // An admin closes the shop while the sheet is open.
    Object.assign(server.state, {
      open: false,
      items: ITEMS.filter((i) => FREE.includes(i.id)),
      doubloons: undefined,
    });
    server.next.buy.push({ status: 403, error: "The shop isn't open yet", code: "closed" });
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    expect(await screen.findByText("The shop opens soon.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("The shop isn't open yet");
    expect(heading()).toHaveFocus();
  });

  it("closes the sheet when the item goes off sale, and says why with focus on the heading", async () => {
    const server = stubServer();
    const user = renderShop();
    const { sheet } = await openSheet(user);
    server.state.items = ITEMS.filter((i) => i.id !== "board.treasure-map");
    server.next.buy.push({ status: 404, error: "That item isn't in the shop", code: "unknown" });
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1500)} doubloons` }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("article", { name: "Treasure Map" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("That item isn't in the shop");
    expect(heading()).toHaveFocus();
  });

  it("lets guests look at the prices, with no buttons", async () => {
    stubServer({ user: null });
    renderShop();
    expect(await card("Treasure Map")).toHaveTextContent(`${num(1500)} doubloons`);
    expect(await card("Serpent Reef")).toHaveTextContent("Free");
    expect(screen.getByRole("link", { name: "Sign in to earn doubloons" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByText(/nothing here costs real money/)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText(/^You have/)).toBeNull();
  });

  it("while closed, says it opens soon and lists what a player owns, to use", async () => {
    const owned = [...FREE, "board.treasure-map"];
    const server = stubServer({
      shop: {
        open: false,
        items: ITEMS.filter((i) => owned.includes(i.id)),
        owned,
        doubloons: undefined,
      },
    });
    const user = renderShop();
    expect(await screen.findByText("The shop opens soon.")).toBeInTheDocument();
    expect(screen.getByText("Keep earning: your doubloons will be waiting.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your boards and card backs" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(owned.length);
    // No prices and nothing to buy: only Use it and In use.
    expect(screen.queryByText(/doubloons$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
    expect(screen.queryByText(/^You have/)).toBeNull();
    const use = within(await card("Treasure Map")).getByRole("button");
    expect(await card("Treasure Map")).toHaveTextContent("Owned");
    await user.click(use);
    expect(await screen.findByText("Treasure Map is now in use")).toBeInTheDocument();
    expect(server.posts).toEqual([
      { path: "/api/shop/use", body: { itemId: "board.treasure-map" } },
    ]);
  });

  it("while closed, asks guests to sign in", async () => {
    stubServer({ user: null, shop: { open: false, items: [] } });
    renderShop();
    expect(await screen.findByText("The shop opens soon.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to earn doubloons" })).toBeInTheDocument();
    expect(screen.queryByText(/Keep earning/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("shows admins the whole shop as a preview while it's closed", async () => {
    const server = stubServer({
      user: person("Captain", true),
      shop: { open: false, preview: true },
    });
    const user = renderShop();
    expect(
      await screen.findByText(
        "Preview: only admins can see the shop until it opens (Admin → Shop).",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("The shop opens soon.")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(ITEMS.length);
    const { sheet } = await openSheet(user, "Crimson");
    await user.click(within(sheet).getByRole("button", { name: `Buy for ${num(1000)} doubloons` }));
    expect(await within(sheet).findByText("Crimson is yours.")).toBeInTheDocument();
    expect(server.posts).toEqual([
      { path: "/api/shop/buy", body: { itemId: "deck.crimson", price: 1000 } },
    ]);
  });

  it("says it opens soon on a server without the shop", async () => {
    const server = stubServer();
    server.next.shop.push({ status: 404, error: "Not found" });
    renderShop();
    expect(await screen.findByText("The shop opens soon.")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't reach/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("says when it can't reach the shop, and tries again without losing focus", async () => {
    const server = stubServer();
    server.next.shop.push("offline", "offline");
    const user = renderShop();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't reach the shop");
    const again = screen.getByRole("button", { name: "Try again" });
    const release = hold(server, "shop");
    await user.click(again);
    // The same button while it tries, so focus stays on it.
    expect(again).toHaveAccessibleName("Trying again…");
    expect(again).toHaveAttribute("aria-disabled", "true");
    expect(again).toHaveAttribute("aria-busy", "true");
    expect(again).toHaveFocus();
    expect(alert).toBeEmptyDOMElement();
    await user.click(again);
    release();
    // It fails again, and says so again.
    await waitFor(() => expect(alert).toHaveTextContent("Couldn't reach the shop"));
    expect(again).toHaveAccessibleName("Try again");
    expect(again).toHaveFocus();
    expect(count(server, "GET /api/shop")).toBe(2);
    // Then it works: the shop takes the button's place, and focus goes to the heading.
    await user.click(again);
    expect(await card("Treasure Map")).toBeInTheDocument();
    expect(heading()).toHaveFocus();
    expect(count(server, "GET /api/shop")).toBe(3);
  });

  it("leaves out item types this build doesn't know", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const pegs: ShopItem = {
      id: "pegs.gold",
      type: "pegs",
      name: "Gold Pegs",
      description: "Pegs of solid gold.",
      price: 500,
      isDefault: false,
      available: true,
    };
    stubServer({ shop: { items: [...ITEMS, pegs] } });
    renderShop();
    expect(await card("Treasure Map")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Gold Pegs" })).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(ITEMS.length);
    expect(error).not.toHaveBeenCalled();
  });

  describe("an item this build has no art for", () => {
    /**
     * A newer server's board and back. Each test gives them ids of its own: a missing skin is
     * logged once per id for the whole file, so with shared ids only the first test to run would
     * see it logged.
     */
    async function showNewer(tag: string) {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const newer: ShopItem[] = [
        { ...item("board.treasure-map"), id: `board.sea-serpent-${tag}`, name: "Sea Serpent" },
        { ...item("deck.crimson"), id: `deck.mermaid-${tag}`, name: "Mermaid" },
      ];
      stubServer({
        shop: { items: [...ITEMS, ...newer], owned: [...FREE, `deck.mermaid-${tag}`] },
      });
      renderShop();
      return { serpent: await card("Sea Serpent"), mermaid: await card("Mermaid"), error };
    }

    it("shows the default with a note to reload, and can't be bought (but can be used)", async () => {
      const { serpent, mermaid, error } = await showNewer("web");
      expect(serpent).toHaveTextContent("Reload the page to see this item");
      expect(serpent.querySelector("svg")).toHaveAttribute("data-skin", "serpent-reef");
      const buy = within(serpent).getByRole("button");
      expect(buy).toHaveAttribute("aria-disabled", "true");
      expect(buy).toHaveAccessibleDescription("Reload the page to see this item");
      expect(mermaid).toHaveTextContent("Reload the page to see this item");
      expect(mermaid.querySelector("img")).toHaveAttribute("data-deck", "cribbage-logo");
      const use = within(mermaid).getByRole("button");
      expect(use).toHaveAccessibleName("Use it: Mermaid");
      expect(use).not.toHaveAttribute("aria-disabled");
      // Logged once for each, however often it's drawn.
      expect(error.mock.calls.filter(([m]) => /can't be used/.test(String(m)))).toHaveLength(2);
    });

    it("says to update the app in the iPhone app", async () => {
      native.app = true;
      const { serpent } = await showNewer("app");
      expect(serpent).toHaveTextContent("Update the app to see this item");
      expect(serpent).not.toHaveTextContent("Reload the page");
    });
  });
});
