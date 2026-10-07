/** Pirate scenes stop the game until each player taps Carry on. */
import { expect, test } from "./fixtures.js";
import {
  gameOver,
  hand,
  inviteGame,
  move,
  playToTheEnd,
  startCrewGame,
  usePower,
} from "./table.js";

test("a pirate scene stays up until you carry on", async ({ page }) => {
  await startCrewGame(page, "Pirate");
  await usePower(page, "Spyglass");
  const scene = page.getByRole("dialog", { name: /You spy from the crow's nest!/ });
  await expect(scene).toBeVisible();
  // Well past the 3.4-second clip, the scene (and the game behind it) still waits.
  await page.waitForTimeout(5_000);
  await expect(scene).toBeVisible();
  await scene.getByRole("button", { name: "Carry on" }).click();
  await expect(scene).toBeHidden();
  // And the game goes on: throw two to the crib.
  await expect(async () => {
    await move(page);
    await expect(hand(page).getByRole("button")).toHaveCount(4, { timeout: 1_000 });
  }).toPass();
});

test("online, a pirate scene waits for both players to carry on", async ({ signedIn, tag }) => {
  const captain = await signedIn("Captain");
  const calico = await signedIn("Calico");
  await inviteGame(captain, calico, "pirate");
  await usePower(captain, "Spyglass");

  const mine = captain.getByRole("dialog", { name: /You spy from the crow's nest!/ });
  const theirs = calico.getByRole("dialog", {
    name: new RegExp(`Captain${tag} spies from the crow's nest!`),
  });
  await expect(mine).toBeVisible();
  await expect(theirs).toBeVisible();

  await mine.getByRole("button", { name: "Carry on" }).click();
  await expect(mine.getByRole("status")).toHaveText(`Waiting for Calico${tag}…`);
  // Nobody can play on yet: the captain's scene stays up while Calico is still watching.
  await calico.waitForTimeout(2_000);
  await expect(mine).toBeVisible();
  await expect(theirs).toBeVisible();

  await theirs.getByRole("button", { name: "Carry on" }).click();
  await expect(mine).toBeHidden();
  await expect(theirs).toBeHidden();
  // Both can throw to the crib now.
  for (const p of [captain, calico]) {
    await expect(async () => {
      await move(p);
      await expect(hand(p).getByRole("button")).toHaveCount(4, { timeout: 1_000 });
    }).toPass();
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a guest plays a whole pirate game against the crew", async ({ page }, info) => {
    // About three minutes (the crew waits for a Belay That! before each card it plays): one
    // browser is enough, and the iPhone runs the scene tests above.
    test.skip(info.project.name !== "chromium", "A long game; once is enough");
    test.setTimeout(420_000);
    await startCrewGame(page, "Pirate");
    await playToTheEnd([page], 400_000);
    await expect(gameOver(page)).toContainText("121");
  });
});
