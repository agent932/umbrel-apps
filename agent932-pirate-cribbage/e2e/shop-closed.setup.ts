/**
 * The shop as a release ships it: closed to players, with a preview for admins. A setup project
 * (see playwright.config.ts), so it runs before any test can open the shop.
 */
import { expect, test } from "./fixtures.js";

test("the shop starts closed to players, with a preview for admins", async ({
  page,
  signedIn,
  tag,
}) => {
  const shopLinks = (p: typeof page) => p.getByRole("link", { name: /^Shop/ });

  // A guest: the shop opens soon, with a way to start earning.
  await page.goto("/shop");
  await expect(page.getByText("The shop opens soon.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to earn doubloons" })).toBeVisible();
  // Back in the harbour (the app has asked the server by now): no Shop links.
  await page.getByRole("link", { name: "Harbour" }).click();
  await expect(page.getByRole("heading", { name: "Play the crew" })).toBeVisible();
  await expect(shopLinks(page)).toHaveCount(0);

  // A player: the same, and the server won't sell to them either.
  const anne = await signedIn("Anne");
  await anne.goto("/shop");
  await expect(anne.getByText("The shop opens soon.")).toBeVisible();
  await expect(anne.getByText("Keep earning: your doubloons will be waiting.")).toBeVisible();
  await expect(anne.getByRole("button", { name: /^Buy/ })).toHaveCount(0);
  const buy = await anne.request.post("/api/shop/buy", {
    data: { itemId: "board.treasure-map", price: 1500 },
  });
  expect(buy.status()).toBe(403);
  expect(await buy.json()).toMatchObject({ code: "closed" });
  await anne.getByRole("link", { name: "Harbour" }).click();
  await expect(anne.getByRole("navigation", { name: "Account" })).toContainText(`Anne${tag}`);
  await expect(shopLinks(anne)).toHaveCount(0);

  // The admin: Shop (preview) in the account bar and the harbour, and the preview banner.
  const captain = await signedIn("Captain");
  await captain.goto("/cribbage");
  const account = captain.getByRole("navigation", { name: "Account" });
  await expect(
    captain.getByRole("link", { name: "Shop (preview): boards and card backs" }),
  ).toBeVisible();
  await account.getByRole("link", { name: "Shop (preview)" }).click();
  await expect(
    captain.getByText("Preview: only admins can see the shop until it opens (Admin → Shop)."),
  ).toBeVisible();
  await expect(captain.getByRole("article", { name: "Treasure Map" })).toBeVisible();
  // Nobody has saved the switch yet: closed by default.
  const admin = await captain.request.get("/api/admin/shop");
  expect(await admin.json()).toMatchObject({ open: false, saved: false });
});
