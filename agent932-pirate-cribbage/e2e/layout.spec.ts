/**
 * The table at real screen sizes: nothing covers anything else, nothing runs off the screen, and
 * nothing scrolls sideways. These are the problems we used to find by eye on a phone.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { cutForDeal, hand, settle, startCrewGame } from "./table.js";

type Box = { left: number; top: number; right: number; bottom: number };

/** The parts of the table, by what a player would call them. */
const PARTS: Record<string, string> = {
  menu: ".t-menu",
  "opponent's cards": '[aria-label^="Opponent holds"]',
  opponent: ".t-opp",
  board: ".t-board",
  prompt: ".t-status",
  pile: ".t-pile-zone",
  deck: '[aria-label="Deck"]',
  crib: '[aria-label$="crib"]',
  "action button": ".t-act",
  "your name": ".t-you",
  "pirate powers": '[aria-label="Pirate powers"]',
};

/** Where each part is on screen, plus "your cards": the cards in your hand taken together. */
async function measure(page: Page) {
  return page.evaluate((parts) => {
    const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    const found: Record<string, Box> = {};
    for (const [name, selector] of Object.entries(parts)) {
      const el = document.querySelector(selector);
      if (el) found[name] = box(el.getBoundingClientRect());
    }
    const cards = [...document.querySelectorAll('[aria-label="Your hand"] button')].map((c) =>
      c.getBoundingClientRect(),
    );
    if (cards.length) {
      found["your cards"] = {
        left: Math.min(...cards.map((c) => c.left)),
        top: Math.min(...cards.map((c) => c.top)),
        right: Math.max(...cards.map((c) => c.right)),
        bottom: Math.max(...cards.map((c) => c.bottom)),
      };
    }
    // Your name on its plate, cut short ("Y…") if the plate is squeezed.
    const name = document.querySelector(".t-you .truncate");
    return {
      found,
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      nameCut: !!name && name.scrollWidth > name.clientWidth + 1,
    };
  }, PARTS);
}

// Cards are tilted in the fan, so their boxes are a little bigger than the cards: a few pixels
// of overlap isn't something a player can see.
const SLACK = 8;

function overlaps(found: Record<string, Box>, allowed: string[][] = []) {
  const names = Object.keys(found);
  const bad: string[] = [];
  for (const [i, a] of names.entries()) {
    for (const b of names.slice(i + 1)) {
      if (allowed.some((pair) => pair.includes(a) && pair.includes(b))) continue;
      const x =
        Math.min(found[a]!.right, found[b]!.right) - Math.max(found[a]!.left, found[b]!.left);
      const y =
        Math.min(found[a]!.bottom, found[b]!.bottom) - Math.max(found[a]!.top, found[b]!.top);
      if (x > SLACK && y > SLACK) bad.push(`${a} covers ${b} (${Math.round(x)}×${Math.round(y)})`);
    }
  }
  return bad;
}

function offScreen(found: Record<string, Box>, width: number, height: number, except: string[]) {
  return Object.entries(found)
    .filter(([name]) => !except.includes(name))
    .filter(([, b]) => b.left < -2 || b.top < -2 || b.right > width + 2 || b.bottom > height + 2)
    .map(([name]) => `${name} runs off the screen`);
}

async function tableAt(page: Page, width: number, height: number, rules: "Classic" | "Pirate") {
  await page.setViewportSize({ width, height });
  await startCrewGame(page, rules);
  await expect(page.getByRole("button", { name: "Throw to crib" })).toBeVisible();
  await settle(page);
  return measure(page);
}

const UPRIGHT = [
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 13", width: 390, height: 844 },
  { name: "iPhone Pro Max", width: 430, height: 932 },
  { name: "iPad mini", width: 744, height: 1133 },
  { name: "iPad Pro 13-inch", width: 1032, height: 1376 },
];
const SIDEWAYS = [
  { name: "iPhone SE sideways", width: 667, height: 375, project: "iphone" },
  { name: "iPhone 13 sideways", width: 844, height: 390, project: "iphone" },
  { name: "iPad sideways", width: 1180, height: 820, project: "iphone" },
  { name: "laptop", width: 1280, height: 800, project: "chromium" },
  { name: "desktop", width: 1440, height: 900, project: "chromium" },
];

for (const rules of ["Classic", "Pirate"] as const) {
  for (const screen of UPRIGHT) {
    test(`${rules} table on an upright ${screen.name} (${screen.width}×${screen.height})`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== "iphone", "Phones and iPads: WebKit, as in the app");
      const { found, width, height, scrollWidth, nameCut } = await tableAt(
        page,
        screen.width,
        screen.height,
        rules,
      );
      expect(Object.keys(found)).toEqual(expect.arrayContaining(["board", "your cards"]));
      expect(overlaps(found)).toEqual([]);
      expect(offScreen(found, width, height, [])).toEqual([]);
      expect(scrollWidth).toBeLessThanOrEqual(width);
      expect(nameCut, "your name is cut short").toBe(false);
    });
  }

  for (const screen of SIDEWAYS) {
    test(`${rules} table on a ${screen.name} screen (${screen.width}×${screen.height})`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== screen.project);
      const { found, width, height, scrollWidth, nameCut } = await tableAt(
        page,
        screen.width,
        screen.height,
        rules,
      );
      expect(overlaps(found)).toEqual([]);
      // On a wide screen your hand peeks up from the bottom edge, by design.
      expect(offScreen(found, width, height, ["your cards"])).toEqual([]);
      expect(scrollWidth).toBeLessThanOrEqual(width);
      expect(nameCut, "your name is cut short").toBe(false);
    });
  }
}

for (const screen of UPRIGHT.slice(0, 2)) {
  test(`Peggy's tips don't cover the table on an ${screen.name}`, async ({ page }, info) => {
    test.skip(info.project.name !== "iphone", "Phones: WebKit, as in the app");
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await page.goto("/cribbage");
    await page.getByRole("button", { name: /Learn to play with Peggy/ }).click();
    await cutForDeal(page);
    await expect(hand(page).getByRole("button")).toHaveCount(6);
    const tip = page.getByLabel("Peggy's tip");
    await expect(tip).toBeVisible();
    await settle(page);
    const { found } = await measure(page);
    const tipBox = (await tip.boundingBox())!;
    const withTip = {
      ...found,
      "Peggy's tip": {
        left: tipBox.x,
        top: tipBox.y,
        right: tipBox.x + tipBox.width,
        bottom: tipBox.y + tipBox.height,
      },
    };
    expect(overlaps(withTip).filter((o) => o.includes("Peggy's tip"))).toEqual([]);
  });
}
