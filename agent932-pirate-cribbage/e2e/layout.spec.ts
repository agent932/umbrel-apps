/**
 * The table at real screen sizes: nothing covers anything else, nothing runs off the screen, and
 * nothing scrolls sideways. These are the problems we used to find by eye on a phone.
 *
 * Each game is turned and resized to every screen in turn, as a player turns a phone or an iPad,
 * rather than dealt afresh for each one: the table settles exactly where a fresh game at that size
 * puts it (each test checks this again at the end).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { cutForDeal, hand, settle, startCrewGame } from "./table.js";

// Each test plays its own game, so they can run side by side.
test.describe.configure({ mode: "parallel" });

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

/** The parts that sit somewhere else than they did before (more than a pixel away). */
function moved(before: Record<string, Box>, after: Record<string, Box>) {
  const sides = ["left", "top", "right", "bottom"] as const;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((name) => {
    const [a, b] = [before[name], after[name]];
    if (!a || !b) return [`${name} ${a ? "has gone" : "has appeared"}`];
    const by = Math.max(...sides.map((side) => Math.abs(a[side] - b[side])));
    return by > 1 ? [`${name} moved ${Math.round(by)}px`] : [];
  });
}

type Screen = { on: string; width: number; height: number; upright?: boolean };

/** Turns or resizes the screen, lets the table settle into it, and measures it. */
async function lookAt(page: Page, screen: Screen) {
  await page.setViewportSize({ width: screen.width, height: screen.height });
  // A frame or two for the table to notice the new size before it can start moving.
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
  await settle(page);
  return measure(page);
}

/**
 * Runs one screen's checks as a step of its own. If any fail, it keeps a picture of that screen:
 * the one taken when the test fails shows only the screen it ended on.
 */
async function onScreen(page: Page, where: string, checks: () => Promise<void>) {
  await test.step(where, async () => {
    const before = test.info().errors.length;
    await checks();
    if (test.info().errors.length > before)
      await test.info().attach(where, { body: await page.screenshot(), contentType: "image/png" });
  });
}

const IPHONE_SE: Screen = { on: "an upright iPhone SE", width: 375, height: 667, upright: true };
const IPHONE_13: Screen = { on: "an upright iPhone 13", width: 390, height: 844, upright: true };

/**
 * Phones and iPads play in WebKit, as in the app; laptops and desktops in Chromium. In this order
 * each phone is turned sideways before the next, as a player turns one.
 */
const GROUPS: { project: string; on: string; why: string; screens: Screen[] }[] = [
  {
    project: "iphone",
    on: "every phone and iPad",
    why: "Phones and iPads: WebKit, as in the app",
    screens: [
      IPHONE_SE,
      { on: "an iPhone SE turned sideways", width: 667, height: 375 },
      IPHONE_13,
      { on: "an iPhone 13 turned sideways", width: 844, height: 390 },
      { on: "an upright iPhone Pro Max", width: 430, height: 932, upright: true },
      { on: "an upright iPad mini", width: 744, height: 1133, upright: true },
      { on: "an upright iPad Pro 13-inch", width: 1032, height: 1376, upright: true },
      { on: "an iPad turned sideways", width: 1180, height: 820 },
    ],
  },
  {
    project: "chromium",
    on: "a laptop and a desktop",
    why: "Laptops and desktops: Chromium",
    screens: [
      { on: "a laptop", width: 1280, height: 800 },
      { on: "a desktop", width: 1440, height: 900 },
    ],
  },
];

for (const rules of ["Classic", "Pirate"] as const) {
  for (const group of GROUPS) {
    test(`${rules} table on ${group.on}`, async ({ page }, info) => {
      test.skip(info.project.name !== group.project, group.why);
      // Pirate games go through the screens the other way round: each screen is reached from a
      // different one, and the game starts fresh at the other end.
      const screens = rules === "Classic" ? group.screens : [...group.screens].reverse();
      const first = screens[0]!;
      await page.setViewportSize({ width: first.width, height: first.height });
      await startCrewGame(page, rules);
      await expect(page.getByRole("button", { name: "Throw to crib" })).toBeVisible();
      // The crew throws to the crib straight after the deal: measure once its cards are in.
      await expect(page.getByLabel("Opponent holds 4 cards")).toBeVisible();
      // Whose crib it is moves the crib and changes the prompt: say which, if anything fails.
      const crib = await page.locator(PARTS.crib!).getAttribute("aria-label");
      const problem = (where: string, what: string) =>
        `${where}, ${crib?.replace(/^Your/, "your")}: ${what}`;
      let fresh: Record<string, Box> | undefined;

      for (const screen of screens) {
        const where = `${rules} table on ${screen.on} (${screen.width}×${screen.height})`;
        await onScreen(page, where, async () => {
          const { found, width, height, scrollWidth, nameCut } = await lookAt(page, screen);
          fresh ??= found;
          if (screen.upright) {
            expect
              .soft(Object.keys(found), problem(where, "the board or your cards are missing"))
              .toEqual(expect.arrayContaining(["board", "your cards"]));
          }
          expect.soft(overlaps(found), problem(where, "parts cover each other")).toEqual([]);
          // On a wide screen your hand peeks up from the bottom edge, by design.
          const mayPeek = screen.upright ? [] : ["your cards"];
          expect
            .soft(
              offScreen(found, width, height, mayPeek),
              problem(where, "parts run off the screen"),
            )
            .toEqual([]);
          expect
            .soft(scrollWidth, problem(where, "the table scrolls sideways"))
            .toBeLessThanOrEqual(width);
          expect.soft(nameCut, problem(where, "your name is cut short")).toBe(false);
        });
      }

      // Back where the game started: everything sits where it did on the fresh start, so each
      // screen above was measured as a fresh game there would be.
      const back = `${rules} table back on ${first.on} (${first.width}×${first.height})`;
      await onScreen(page, back, async () => {
        const { found } = await lookAt(page, first);
        expect
          .soft(moved(fresh!, found), problem(back, "not where a fresh start put it"))
          .toEqual([]);
      });
    });
  }
}

test("Peggy's tips don't cover the table on an iPhone SE or an iPhone 13", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "iphone", "Phones: WebKit, as in the app");
  await page.setViewportSize({ width: IPHONE_SE.width, height: IPHONE_SE.height });
  await page.goto("/cribbage");
  await page.getByRole("button", { name: /Learn to play with Peggy/ }).click();
  await cutForDeal(page);
  await expect(hand(page).getByRole("button")).toHaveCount(6);
  const tip = page.getByLabel("Peggy's tip");
  await expect(tip).toBeVisible();

  for (const screen of [IPHONE_SE, IPHONE_13]) {
    const where = `Peggy's tips on ${screen.on} (${screen.width}×${screen.height})`;
    await onScreen(page, where, async () => {
      const { found } = await lookAt(page, screen);
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
      expect
        .soft(
          overlaps(withTip).filter((o) => o.includes("Peggy's tip")),
          `${where}: the tip covers the table`,
        )
        .toEqual([]);
    });
  }
});
