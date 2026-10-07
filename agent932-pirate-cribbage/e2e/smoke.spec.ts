import { expect, test } from "./fixtures.js";

test("the hub and the harbour load without errors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Deckhand Games" })).toBeVisible();
  await page.getByRole("list", { name: "Games" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/cribbage$/);
  await expect(page.getByRole("heading", { name: "Play the crew" })).toBeVisible();
  // The offline copy for the home screen app: the service worker installs.
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())))
    .toBe(true);
});

test("a page that doesn't exist falls back to the app", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.locator("body")).not.toBeEmpty();
  expect((await page.request.get("/api/no-such-route")).status()).toBe(404);
});
