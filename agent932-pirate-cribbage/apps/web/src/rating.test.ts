import { afterEach, describe, expect, it } from "vitest";
import { ASK_AGAIN_AFTER_DAYS, countWinForRating, shouldAsk } from "./rating.js";

const DAY = 24 * 60 * 60 * 1000;

describe("App Store rating prompt", () => {
  afterEach(() => localStorage.clear());

  it("asks after the third win in the app, not before", () => {
    const now = 1_000_000;
    expect(countWinForRating(now, true)).toBe(false);
    expect(countWinForRating(now, true)).toBe(false);
    expect(countWinForRating(now, true)).toBe(true);
    // Then not on the next win.
    expect(countWinForRating(now, true)).toBe(false);
  });

  it("never asks on the web", () => {
    for (let i = 0; i < 5; i++) expect(countWinForRating(1_000_000, false)).toBe(false);
  });

  it("asks again only after many more wins and months", () => {
    const asked = 1_000_000;
    expect(shouldAsk({ wins: 20, askedAt: asked }, asked + 30 * DAY)).toBe(false);
    expect(shouldAsk({ wins: 5, askedAt: asked }, asked + 200 * DAY)).toBe(false);
    expect(shouldAsk({ wins: 20, askedAt: asked }, asked + ASK_AGAIN_AFTER_DAYS * DAY)).toBe(true);
  });
});
