import { expect, test } from "./fixtures.js";
import { gameOver, hand, move, playToTheEnd, startCrewGame } from "./table.js";

test.describe("with reduced motion", () => {
  // A player's setting: the hand counts are shown at once, so a whole game takes about a minute.
  test.use({ reducedMotion: "reduce" });

  test("a guest plays a whole game against the crew", async ({ page }) => {
    test.slow();
    await startCrewGame(page);
    await playToTheEnd([page]);
    await expect(gameOver(page)).toContainText("121");
    await gameOver(page).getByRole("button", { name: "Harbour" }).click();
    await expect(page.getByRole("heading", { name: "Play the crew" })).toBeVisible();
  });
});

test("a guest's game is still there after the page reloads", async ({ page }) => {
  await startCrewGame(page);
  await expect(async () => {
    await move(page);
    await expect(hand(page).getByRole("button")).toHaveCount(4, { timeout: 1_000 });
  }).toPass();
  await page.reload();
  await page.goto("/cribbage");
  await page.getByRole("button", { name: "Resume yer game" }).click();
  await expect(hand(page).getByRole("button")).toHaveCount(4);
});
