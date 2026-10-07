/**
 * The shop: buying boards and card backs with doubloons, using them, and seeing them at the
 * table. Each test has a new player of its own (the shopper fixture), and opens the shop.
 */
import type { Page } from "@playwright/test";
import { expect, openShop, test } from "./fixtures.js";
import { cutForDeal, hand, inviteGame, setSail, startCrewGame } from "./table.js";

const board = (page: Page) => page.locator(".t-board svg[data-skin]");
/** The opponent's face-down cards that wear this back. */
const opponentsBacks = (page: Page, deck: string) =>
  page.locator(`[aria-label^="Opponent holds"] [data-deck="${deck}"]`);
/** The opponent's face-down cards that wear any other back. */
const otherBacks = (page: Page, deck: string) =>
  page.locator(`[aria-label^="Opponent holds"] [data-deck]:not([data-deck="${deck}"])`);

/** The shopper's own request, which must work for the test to go on. */
async function post(page: Page, url: string, data: object) {
  const res = await page.request.post(url, { data });
  expect(res.status(), await res.text()).toBe(200);
}

test("a player buys a board, uses it, and plays on it", async ({ shopper }) => {
  const { page } = await shopper("Flint", 2500);
  await page.goto("/shop");
  await expect(page.getByText("You have 2,500 doubloons")).toBeVisible();
  await page.getByRole("button", { name: "Buy Treasure Map for 1,500 doubloons" }).click();
  const sheet = page.getByRole("dialog", { name: "Buy Treasure Map?" });
  await sheet.getByRole("button", { name: "Buy for 1,500 doubloons" }).click();
  // Bought: the sheet is named for it now.
  const bought = page.getByRole("dialog", { name: "Treasure Map is yours" });
  await expect(bought.getByRole("status")).toHaveText("Treasure Map is yours.");
  await bought.getByRole("button", { name: "Use it now" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "now in use" })).toHaveText(
    "Treasure Map is now in use",
  );
  // Focus is back on the card's button, which now says so.
  await expect(page.getByRole("button", { name: "In use: Treasure Map" })).toBeFocused();

  await page.goto("/cribbage");
  await expect(page.getByTitle("Doubloons")).toHaveText("1,000 doubloons");
  await startCrewGame(page);
  await expect(board(page)).toHaveAttribute("data-skin", "treasure-map");
  await expect(board(page)).toBeVisible();
});

test("a player buys a card back, uses it, and the crew's cards wear it", async ({ shopper }) => {
  const { page } = await shopper("Silver", 1000);
  await page.goto("/shop");
  await page.getByRole("button", { name: "Buy Crimson for 1,000 doubloons" }).click();
  const sheet = page.getByRole("dialog", { name: "Buy Crimson?" });
  await sheet.getByRole("button", { name: "Buy for 1,000 doubloons" }).click();
  const bought = page.getByRole("dialog", { name: "Crimson is yours" });
  await expect(bought.getByRole("status")).toHaveText("Crimson is yours.");
  // Not now: Close, then Use it on the card, whose button has focus again. From the keyboard,
  // where focus matters (Safari doesn't focus a button that's clicked).
  await bought.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const use = page.getByRole("button", { name: "Use it: Crimson" });
  await expect(use).toBeFocused();
  await expect(page.getByText("You have 0 doubloons")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "now in use" })).toHaveText(
    "Crimson is now in use",
  );
  // The same button, now saying so, still has focus.
  await expect(page.getByRole("button", { name: "In use: Crimson" })).toBeFocused();

  // The deck fanned out for the cut, then the crew's hand.
  await setSail(page);
  const cut = page.getByRole("group", { name: "Deck to cut" });
  await expect(cut.locator('[data-deck="crimson"]').first()).toBeVisible();
  await expect(cut.locator('[data-deck]:not([data-deck="crimson"])')).toHaveCount(0);
  await cutForDeal(page);
  await expect(hand(page).getByRole("button")).toHaveCount(6);
  // The crew throws to the crib soon after the deal, so its fan may hold 6 cards or 4: count
  // backs of another kind, not Crimson ones.
  await expect(opponentsBacks(page, "crimson").first()).toBeVisible();
  await expect(otherBacks(page, "crimson")).toHaveCount(0);
});

test("a player who can't afford an item can't buy it", async ({ shopper }) => {
  const { page } = await shopper("Kidd", 0);
  await page.goto("/shop");
  await expect(page.getByText("You have 0 doubloons")).toBeVisible();
  const buy = page.getByRole("button", { name: "Buy Treasure Map for 1,500 doubloons" });
  await expect(buy).toHaveAttribute("aria-disabled", "true");
  await expect(buy).toHaveAccessibleDescription("1,500 more doubloons needed");
  await expect(
    page.getByRole("button", { name: "Buy Crimson for 1,000 doubloons" }),
  ).toHaveAttribute("aria-disabled", "true");
  // A tap does nothing: no confirm sheet opens.
  await buy.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The free items are already theirs.
  await expect(page.getByRole("button", { name: "Use it: Moon and Compass" })).toBeVisible();
});

test("a guest can look at the shop but not buy", async ({ page }) => {
  await openShop();
  await page.goto("/shop");
  await expect(page.getByRole("article", { name: "Treasure Map" })).toContainText(
    "1,500 doubloons",
  );
  await expect(page.getByRole("article", { name: "Crimson" })).toContainText("1,000 doubloons");
  await expect(page.getByRole("article", { name: "Serpent Reef" })).toContainText("Free");
  await expect(page.getByRole("link", { name: "Sign in to earn doubloons" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
});

test("online, both players see the host's board and card backs", async ({ shopper }) => {
  const host = await shopper("Morgan", 2500);
  const guest = await shopper("Teach", 0);
  // The host bought and uses both; the guest uses the defaults.
  for (const [itemId, price] of [
    ["board.treasure-map", 1500],
    ["deck.crimson", 1000],
  ] as const) {
    await post(host.page, "/api/shop/buy", { itemId, price });
    await post(host.page, "/api/shop/use", { itemId });
  }

  await inviteGame(host.page, guest.page);
  for (const p of [host.page, guest.page]) {
    await expect(board(p)).toHaveAttribute("data-skin", "treasure-map");
    await expect(board(p)).toBeVisible();
    await expect(opponentsBacks(p, "crimson")).toHaveCount(6);
  }
  // The table menu says whose they are.
  for (const [p, whose] of [
    [guest.page, `${host.name}'s`],
    [host.page, "yours"],
  ] as const) {
    await p.getByRole("button", { name: "Menu" }).click();
    await expect(p.getByRole("dialog", { name: "Menu" })).toContainText(
      `Board and card backs: ${whose}`,
    );
  }
});

/** Sideways scrolling, and the buttons shown: how many, and any under a fingertip's 44 px. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const shown = [...document.querySelectorAll("button")].filter(
      (b) => b.getClientRects().length > 0,
    );
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      buttons: shown.length,
      small: shown
        .map((b) => ({
          name: b.getAttribute("aria-label") ?? b.textContent?.trim(),
          height: b.getBoundingClientRect().height,
        }))
        .filter((b) => b.height < 43.5)
        .map((b) => `${b.name} (${Math.round(b.height)} px)`),
    };
  });
}

const SCREENS = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone SE sideways", width: 667, height: 375 },
  { name: "iPad", width: 820, height: 1180 },
  { name: "iPad sideways", width: 1180, height: 820 },
];

for (const screen of SCREENS) {
  test(`the shop and its confirm sheet fit an ${screen.name} (${screen.width}×${screen.height})`, async ({
    shopper,
  }, info) => {
    test.skip(info.project.name !== "iphone", "Phones and iPads: WebKit, as in the app");
    const { page } = await shopper(`Mary${screen.width}`, 1500);
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("/shop");
    await expect(page.getByText("You have 1,500 doubloons")).toBeVisible();
    const shop = await measure(page);
    expect(shop.scrollWidth).toBeLessThanOrEqual(shop.width);
    // A button on every card: Buy, or Use it for the free items.
    expect(shop.buttons).toBeGreaterThanOrEqual(await page.getByRole("article").count());
    expect(shop.small, "buttons under 44 px").toEqual([]);

    // The sheet fits inside the screen with Cancel in view, without scrolling.
    await page.getByRole("button", { name: "Buy Treasure Map for 1,500 doubloons" }).click();
    const sheet = page.getByRole("dialog", { name: "Buy Treasure Map?" });
    await expect(sheet).toBeInViewport({ ratio: 1 });
    await expect(sheet.getByRole("button", { name: "Cancel" })).toBeInViewport({ ratio: 1 });
    const open = await measure(page);
    expect(open.scrollWidth).toBeLessThanOrEqual(open.width);
    expect(open.small, "buttons under 44 px").toEqual([]);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toBeHidden();
  });
}
