import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { authFile, type Player, username } from "./players.js";

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

type Fixtures = {
  /** This project's player tag (see players.ts). */
  tag: string;
  /** A separate browser, signed in as one of this project's players. */
  signedIn: (player: Player) => Promise<Page>;
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
    const opened: { context: BrowserContext; problems: string[]; name: string }[] = [];
    await use(async (player) => {
      const name = username(player, tag);
      const context = await browser.newContext({ storageState: authFile(name) });
      await prepare(context);
      const page = await context.newPage();
      opened.push({ context, problems: watch(page), name });
      return page;
    });
    for (const o of opened) {
      expect(o.problems, `errors in ${o.name}'s browser`).toEqual([]);
      await o.context.close();
    }
  },
});

export { expect };
