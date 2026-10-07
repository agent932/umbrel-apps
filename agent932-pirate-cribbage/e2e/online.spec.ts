import { expect, test } from "./fixtures.js";
import { gameOver, inviteGame, lobby, playToTheEnd } from "./table.js";

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("two players play a whole game online through an invite link", async ({ signedIn }) => {
    test.slow();
    const anne = await signedIn("Anne");
    const bonny = await signedIn("Bonny");
    await inviteGame(anne, bonny);
    await playToTheEnd([anne, bonny]);
    // One winner, one loser, and both see 121 on the board.
    const won = [anne, bonny].map((p) => p.getByRole("dialog", { name: "Victory!" }));
    expect((await won[0]!.count()) + (await won[1]!.count())).toBe(1);
    for (const p of [anne, bonny]) await expect(gameOver(p)).toContainText("121");
  });
});

test("quick match pairs two players who are looking", async ({ signedIn }, info) => {
  test.skip(info.project.name !== "chromium", "Every browser project shares one matchmaking queue");
  const calico = await signedIn("Calico");
  const davy = await signedIn("Davy");
  await calico.goto("/cribbage");
  await davy.goto("/cribbage");
  await lobby(calico).getByRole("button", { name: "Quick match" }).click();
  await expect(lobby(calico).getByRole("status")).toBeVisible();
  await lobby(davy).getByRole("button", { name: "Quick match" }).click();
  for (const p of [calico, davy]) {
    await expect(p).toHaveURL(/\/online\//);
    await expect(p.getByRole("heading", { name: "Cut for the deal" })).toBeVisible();
  }
});

test("a player reports and blocks their opponent from the table", async ({ signedIn, tag }) => {
  const jack = await signedIn("Jack");
  const davy = await signedIn("Davy");
  const davyName = `Davy${tag}`;
  await inviteGame(jack, davy);

  await jack.getByRole("button", { name: "Menu" }).click();
  await jack.getByRole("button", { name: `Report or block ${davyName}` }).click();
  const sheet = jack.getByRole("dialog", { name: `Report or block ${davyName}` });
  await sheet.getByRole("button", { name: `Report ${davyName}…` }).click();
  await sheet.getByLabel("Cheating or stalling").check();
  await sheet.getByRole("button", { name: "Send report" }).click();
  await expect(sheet.getByRole("status")).toContainText("Thanks for telling us");
  await sheet.getByRole("button", { name: `Block ${davyName} too…` }).click();
  await sheet.getByRole("button", { name: `Block ${davyName}`, exact: true }).click();
  await expect(sheet.getByRole("status")).toContainText(`You've blocked ${davyName}`);
  await sheet.getByRole("button", { name: "Done" }).click();

  // The Account page lists them, and they can be unblocked there.
  await jack.goto("/account");
  const blocked = jack.getByRole("region", { name: "Blocked players" });
  await expect(blocked).toContainText(davyName);
  await blocked.getByRole("button", { name: "Unblock" }).click();
  await expect(blocked).not.toContainText(davyName);
});
