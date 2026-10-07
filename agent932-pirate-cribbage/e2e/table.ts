/** Playing at the table the way a player does: by the names on the buttons. */
import { expect, type Locator, type Page } from "@playwright/test";

/** Clicks if the control is there and enabled right now; the table moves on between looks. */
async function tryClick(target: Locator, position?: { x: number; y: number }) {
  try {
    if (!(await target.isVisible()) || !(await target.isEnabled())) return false;
    await target.click({ timeout: 1_500, position });
    return true;
  } catch {
    return false;
  }
}

export const gameOver = (page: Page) => page.getByRole("dialog", { name: /Victory|Defeat/ });
export const hand = (page: Page) => page.getByLabel("Your hand");
/** On a phone the hand is fanned and each card covers the next one's middle: tap the corner. */
const CORNER = { x: 12, y: 24 };

/** Taps a card by its corner, as a player does when the cards overlap. */
export const tapCard = (card: Locator) => card.click({ position: CORNER });

/** The radio buttons are hidden behind their pictures; a player taps the label. */
async function choose(page: Page, name: RegExp) {
  const radio = page.getByRole("radio", { name });
  await page.locator("label").filter({ has: radio }).click();
  await expect(radio).toBeChecked();
}

/** From the harbour: an Easy game against the crew, dealt and ready to throw to the crib. */
export async function startCrewGame(page: Page, rules: "Classic" | "Pirate" = "Classic") {
  await page.goto("/cribbage");
  await choose(page, /^Easy/);
  await choose(page, new RegExp(`^${rules}`));
  await page.getByRole("button", { name: /set sail/i }).click();
  await cutForDeal(page);
  await expect(hand(page).getByRole("button")).toHaveCount(6);
}

/** Cut for the deal (again on a tie) until the cards are dealt. The deck is fanned, so like a
 * player, pick the card on top of the fan. */
export async function cutForDeal(page: Page) {
  const free = page.getByRole("button", { name: /^Cut card/ }).and(page.locator(":enabled"));
  await expect(async () => {
    if (!(await hand(page).isVisible())) await tryClick(free.last());
    await expect(hand(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * Makes this player's next move if there is one: next round, cut, set sail, throw two to the
 * crib, or play the first card that can be played. Returns false when there's nothing to do yet.
 */
export async function move(page: Page) {
  // While a dialog (the Show) covers the table, only its buttons can be pressed.
  const dialog = page.getByRole("dialog");
  if (await dialog.count()) {
    return tryClick(dialog.getByRole("button", { name: "Next round", exact: true }));
  }
  // Cut for the starter; in pirate games, set sail without using a power before pegging.
  for (const name of ["Cut the deck", "Set sail"]) {
    if (await tryClick(page.getByRole("button", { name, exact: true }))) return true;
  }
  const cards = hand(page).locator("button:enabled");
  const toCrib = page.getByRole("button", { name: "Throw to crib" });
  if (await toCrib.isVisible().catch(() => false)) {
    // Pick unpicked cards until two are picked (tapping a picked card puts it back).
    const unpicked = hand(page).locator("button:enabled:not([aria-pressed=true])");
    for (let i = 0; i < 2 && (await toCrib.isDisabled().catch(() => false)); i++) {
      await tryClick(unpicked.first(), CORNER);
    }
    return tryClick(toCrib);
  }
  return tryClick(cards.first(), CORNER);
}

/** Plays one or more players' moves until the game ends for all of them. */
export async function playToTheEnd(pages: Page[], timeout = 200_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    let over = 0;
    let moved = false;
    for (const page of pages) {
      if (await gameOver(page).isVisible()) over++;
      else if (await move(page)) moved = true;
    }
    if (over === pages.length) return;
    if (!moved) await pages[0]!.waitForTimeout(150);
  }
  throw new Error("The game didn't finish in time");
}
