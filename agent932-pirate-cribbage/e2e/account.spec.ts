import { expect, test } from "./fixtures.js";
import { PASSWORD } from "./players.js";
import { tapCard } from "./table.js";

test("a new player signs up, logs out and logs back in", async ({ page, tag }, info) => {
  // A retry runs against the same server, so it needs a name not yet taken.
  const name = `Ned${tag}${info.retry}`;
  const account = page.getByRole("navigation", { name: "Account" });

  await page.goto("/signup");
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Email").fill(`${name.toLowerCase()}@example.test`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(account).toContainText(name);
  // The session cookie is out of reach of the page's scripts.
  const cookie = (await page.context().cookies()).find((c) => c.name === "pc_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("pc_session");

  await account.getByRole("button", { name: "Log out" }).click();
  await account.getByRole("link", { name: "Log in" }).click();
  await page.getByLabel("Username or email").fill(name);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(account).toContainText(name);
  await page.reload();
  await expect(account).toContainText(name);
});

test("the daily discard pays doubloons into the balance", async ({ signedIn }) => {
  const page = await signedIn("Captain");
  await page.goto("/cribbage/daily");
  const cards = page.getByLabel("Today's hand").getByRole("button");
  await tapCard(cards.nth(0));
  await tapCard(cards.nth(1));
  await page.getByRole("button", { name: "Throw to the crib" }).click();
  const reward = page
    .getByRole("status")
    .filter({ has: page.getByRole("list", { name: "Doubloons earned" }) });
  await expect(reward).toContainText(/\+(10|25) doubloons/);
  const earned = (await reward.textContent())!.includes("+25") ? 25 : 10;

  await page.goto("/cribbage");
  await expect(page.getByTitle("Doubloons")).toHaveText(`${earned} doubloons`);
});
