/** Playing at the table the way a player does: by the names on the buttons. */
import { errors, expect, type Locator, type Page } from "@playwright/test";

/** Clicks, unless the control goes before it can be clicked: the table moves on between looks. */
async function tap(target: Locator, position?: { x: number; y: number }) {
  try {
    await target.click({ timeout: 1_500, position });
    return true;
  } catch {
    return false;
  }
}

/** Clicks if the control is there and enabled right now. */
async function tryClick(target: Locator, position?: { x: number; y: number }) {
  const ready = (await target.isVisible()) && (await target.isEnabled().catch(() => false));
  return ready && tap(target, position);
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

/** From the harbour: set sail against the Easy crew. The cut for deal comes next. */
export async function setSail(page: Page, rules: "Classic" | "Pirate" = "Classic") {
  await page.goto("/cribbage");
  await choose(page, /^Easy/);
  await choose(page, new RegExp(`^${rules}`));
  await page.getByRole("button", { name: /set sail/i }).click();
}

/** From the harbour: an Easy game against the crew, dealt and ready to throw to the crib. */
export async function startCrewGame(page: Page, rules: "Classic" | "Pirate" = "Classic") {
  await setSail(page, rules);
  await cutForDeal(page);
  await expect(hand(page).getByRole("button")).toHaveCount(6);
}

export const lobby = (page: Page) => page.getByRole("region", { name: "Play online" });

/** One player sends an invite link and the other opens it: both end up at the same table. */
export async function inviteGame(host: Page, guest: Page, rules: "classic" | "pirate" = "classic") {
  await host.goto("/cribbage");
  const choice = lobby(host)
    .getByRole("group", { name: "Online rules" })
    .getByRole("button", { name: rules });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await lobby(host).getByRole("button", { name: "Invite a friend" }).click();
  const link = await lobby(host).getByLabel("Invite link").inputValue();
  await guest.goto(new URL(link).pathname);
  await expect(host).toHaveURL(/\/online\//);
  await expect(guest).toHaveURL(/\/online\//);
  await Promise.all([cutForDeal(host), cutForDeal(guest)]);
}

/** Opens a pirate power's card and uses it. */
export async function usePower(page: Page, name: string) {
  await page.getByRole("group", { name: "Pirate powers" }).getByRole("button", { name }).click();
  await page.getByRole("button", { name: `Use ${name}` }).click();
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

/** A move at the table: the button it takes, or "card" to play the first card that can be played. */
type Move = "Carry on" | "Next round" | "Cut the deck" | "Set sail" | "Throw to crib" | "card";

/**
 * What a look at the table finds: a move, the name of what to tap for it (a card's name, say) and
 * of the dialog it's in, if it's in one.
 */
type Look = { move: Move; name: string; dialog?: string } | "over" | "";

/**
 * One look at the table, from inside the page: the move this player can make now, "over" once the
 * result shows with no scene (a skunk's) still up over it, or "" while there's nothing to do yet.
 * Like a player, it only counts what can be tapped: shown, enabled, and on top where the tap
 * lands (not behind a dialog, a pirate scene or the cards cut for the deal).
 */
function lookAtTable(corner: { x: number; y: number }): Look {
  const shown = (el: Element) => el.getClientRects().length > 0;
  const button = (within: ParentNode, name: string) =>
    [...within.querySelectorAll("button")].find((b) => b.textContent?.trim() === name && shown(b));
  const tappable = (el: HTMLButtonElement | undefined, at?: { x: number; y: number }) => {
    if (!el || el.disabled || el.closest("[inert]")) return false;
    const box = el.getBoundingClientRect();
    const x = box.left + (at?.x ?? box.width / 2);
    const y = box.top + (at?.y ?? box.height / 2);
    // Off the screen, it's scrolled into view to be clicked.
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return true;
    const top = document.elementFromPoint(x, y);
    return !!top && el.contains(top);
  };
  // While a dialog (a pirate scene, the show, the result) covers the table, only its buttons work.
  const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter(shown);
  if (dialogs.length) {
    const scene = dialogs.some((d) => button(d, "Carry on"));
    const result = dialogs.some((d) => /Victory|Defeat/.test(d.getAttribute("aria-label") ?? ""));
    if (result && !scene) return "over";
    for (const move of ["Carry on", "Next round"] as const) {
      const dialog = dialogs.find((d) => tappable(button(d, move)));
      if (dialog) return { move, name: move, dialog: dialog.getAttribute("aria-label") ?? "" };
    }
    return "";
  }
  // Cut for the starter; in pirate games, set sail without using a power before pegging.
  for (const move of ["Cut the deck", "Set sail"] as const) {
    if (tappable(button(document, move))) return { move, name: move };
  }
  const cards = [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Your hand"] button:enabled'),
  ];
  const toCrib = button(document, "Throw to crib");
  if (toCrib) {
    // Two cards to pick first, unless they're picked.
    const unpicked = cards.find((c) => c.getAttribute("aria-pressed") !== "true");
    const ready = toCrib.disabled ? tappable(unpicked, corner) : tappable(toCrib);
    return ready ? { move: "Throw to crib", name: "Throw to crib" } : "";
  }
  const card = cards[0];
  return tappable(card, corner) ? { move: "card", name: card!.getAttribute("aria-label")! } : "";
}

/**
 * Makes the move a look found, then waits for the table to take it (online, that's once the
 * server has it) so the next look doesn't find the same move again. False if the table moved on
 * before the tap.
 */
async function make(page: Page, { move, name, dialog }: Exclude<Look, string>) {
  const target = (
    move === "card"
      ? hand(page)
      : dialog !== undefined
        ? page.getByRole("dialog", { name: dialog, exact: true })
        : page
  ).getByRole("button", { name, exact: true });
  if (move === "Throw to crib") {
    // Pick unpicked cards until two are picked (tapping a picked card puts it back).
    const unpicked = hand(page).locator("button:enabled:not([aria-pressed=true])");
    for (let i = 0; i < 2 && (await target.isDisabled().catch(() => false)); i++) {
      await tap(unpicked.first(), CORNER);
    }
  }
  if (!(await tap(target, move === "card" ? CORNER : undefined))) return false;
  await target.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  return true;
}

/**
 * Waits for this player's next move, watching the table every frame, and makes it: carry on past
 * a pirate scene, next round, cut, set sail, throw two to the crib, or play the first card that
 * can be played. Returns the move, or "over" once the game is.
 */
export async function nextMove(page: Page, timeout = 60_000): Promise<Move | "over"> {
  const end = Date.now() + timeout;
  for (;;) {
    const found = await page.waitForFunction(lookAtTable, CORNER, {
      timeout: Math.max(1, end - Date.now()),
    });
    const look = await found.jsonValue();
    if (look === "over") return look;
    if (look && (await make(page, look))) return look.move;
  }
}

/**
 * Makes this player's next move if one comes up within a moment (the cards cut for the deal may
 * still be on show, say). Returns the move, or false when there's nothing to do yet.
 */
export async function move(page: Page) {
  try {
    const next = await nextMove(page, 1_500);
    return next !== "over" && next;
  } catch (e) {
    if (e instanceof errors.TimeoutError) return false;
    throw e;
  }
}

/**
 * Waits for the table to stop moving (the deal, cards sliding into place): every animation that
 * ends has ended. A slow machine takes longer than a fixed pause would allow.
 */
export async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}

/**
 * Plays one or more players' moves, each as soon as it comes up, until the game ends for all of
 * them. A whole game takes about a minute here and several times that on a CI machine: the test
 * (marked slow) times out first if something is really stuck.
 */
export async function playToTheEnd(pages: Page[], timeout = 690_000) {
  const end = Date.now() + timeout;
  // Like players at their own tables, each makes their moves while the others make theirs.
  const play = async (page: Page) => {
    for (;;) {
      while ((await nextMove(page, end - Date.now())) !== "over");
      // A skunk's scene comes up a frame or two after the result: look again before calling it over.
      await page.waitForTimeout(500);
      if ((await nextMove(page, end - Date.now())) === "over") return;
    }
  };
  await Promise.all(pages.map(play)).catch((e: unknown) => {
    throw e instanceof errors.TimeoutError ? new Error("The game didn't finish in time") : e;
  });
}
