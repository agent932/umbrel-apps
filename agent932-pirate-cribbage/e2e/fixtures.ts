import { randomInt, randomUUID } from "node:crypto";
import {
  test as base,
  expect,
  request,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { authFile, BASE_URL, PASSWORD, type Player, username } from "./players.js";

/** The same game, quicker: the crew plays fast and the pirate cut-scenes are off. */
const SETTINGS = { speed: "fast", animations: false };

async function prepare(context: BrowserContext) {
  await context.addInitScript((settings) => {
    const key = "pirate-cribbage:settings";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(settings));
  }, SETTINGS);
}

/**
 * Collects what would show up as a problem in a player's browser: script errors, console errors
 * and files that fail to load. API errors (a 401 before signing in) are the app's business.
 */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    // Failed loads are reported below with their address, which the console text lacks.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      problems.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    const url = new URL(r.url());
    const ours = url.host === new URL(page.url() || r.url()).host;
    if (r.status() >= 400 && ours && !url.pathname.startsWith("/api/"))
      problems.push(`${r.status()} ${url.pathname}`);
  });
  return problems;
}

type Opened = { context: BrowserContext; problems: string[]; name: string };

/** A separate browser for this player's session, set up and watched like `page`. */
async function open(
  browser: Browser,
  storageState: BrowserContextOptions["storageState"],
  name: string,
  opened: Opened[],
) {
  const context = await browser.newContext({ storageState });
  await prepare(context);
  const page = await context.newPage();
  opened.push({ context, problems: watch(page), name });
  return page;
}

async function closeAll(opened: Opened[]) {
  for (const o of opened) {
    expect(o.problems, `errors in ${o.name}'s browser`).toEqual([]);
    await o.context.close();
  }
}

/** A request the test can't go on without: fails with the server's own words. */
async function ok(response: Promise<APIResponse>) {
  const r = await response;
  if (!r.ok()) throw new Error(`${r.url()}: ${r.status()} ${await r.text()}`);
  return r;
}

/** CaptainC signed up first, so he's the admin: the tests' admin requests use his session. */
async function asAdmin<T>(run: (admin: APIRequestContext) => Promise<T>) {
  const admin = await request.newContext({
    baseURL: BASE_URL,
    storageState: authFile(username("Captain", "C")),
  });
  try {
    return await run(admin);
  } finally {
    await admin.dispose();
  }
}

/**
 * Opens the shop to players, as the owner does in Admin → Shop (harmless to repeat). Only tests
 * open it, and only after shop-closed.setup.ts has seen it closed.
 */
export const openShop = () =>
  asAdmin((admin) => ok(admin.post("/api/admin/shop", { data: { open: true } })));

type Fixtures = {
  /** This project's player tag (see players.ts). */
  tag: string;
  /** A separate browser, signed in as one of this project's players. */
  signedIn: (player: Player) => Promise<Page>;
  /**
   * A new player with this many doubloons, signed in in a separate browser, with the shop open.
   * Named `player` plus the tag and the retry ("FlintC0"), so give each test its own `player`
   * (at most 18 letters; not Ned, whom account.spec.ts signs up). The crew in players.ts is never
   * topped up: account.spec.ts expects Captain's exact balance.
   */
  shopper: (player: string, doubloons: number) => Promise<{ name: string; page: Page }>;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's needs from this pattern
  tag: async ({}, use, info) => use(String(info.project.metadata.tag)),
  context: async ({ context }, use) => {
    await prepare(context);
    await use(context);
  },
  page: async ({ page }, use) => {
    const problems = watch(page);
    await use(page);
    expect(problems, "errors in the browser").toEqual([]);
  },
  signedIn: async ({ browser, tag }, use) => {
    const opened: Opened[] = [];
    await use((player) => {
      const name = username(player, tag);
      return open(browser, authFile(name), name, opened);
    });
    await closeAll(opened);
  },
  shopper: async ({ browser, tag }, use, info) => {
    const opened: Opened[] = [];
    await use(async (player, doubloons) => {
      // A retry runs against the same server, so it needs a name not yet taken.
      const name = `${player}${tag}${info.retry}`;
      // From an address of its own: sign-ups are limited to 10 a minute per address.
      const api = await request.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { "cf-connecting-ip": `10.8.${randomInt(256)}.${randomInt(1, 255)}` },
      });
      await ok(
        api.post("/api/auth/signup", {
          data: { username: name, email: `${name.toLowerCase()}@example.test`, password: PASSWORD },
        }),
      );
      const session = await api.storageState();
      await api.dispose();
      // Doubloons are only earned by playing: an admin adjustment stands in for the games.
      if (doubloons > 0) {
        await asAdmin(async (admin) => {
          const found = await ok(admin.get("/api/admin/users", { params: { q: name } }));
          const { users } = (await found.json()) as { users: { id: string; username: string }[] };
          const id = users.find((u) => u.username === name)!.id;
          await ok(
            admin.post(`/api/admin/users/${id}/doubloons`, {
              data: { delta: doubloons, note: "e2e", requestId: randomUUID() },
            }),
          );
        });
      }
      await openShop();
      return { name, page: await open(browser, session, name, opened) };
    });
    await closeAll(opened);
  },
});

export { expect };
