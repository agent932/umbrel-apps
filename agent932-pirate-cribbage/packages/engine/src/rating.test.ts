import { describe, expect, it } from "vitest";
import { START_RATING, expectedScore, rateGame, seasonReset, tierFor } from "./index.js";

describe("ratings", () => {
  it("gives even players even chances and moves 16 points", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(rateGame(1000, 1000)).toEqual({ winner: 1016, loser: 984 });
  });

  it("rewards upsets more than expected wins", () => {
    const upset = rateGame(1000, 1400);
    const expected = rateGame(1400, 1000);
    expect(upset.winner - 1000).toBeGreaterThan(expected.winner - 1400);
    expect(upset.winner - 1000).toBe(1400 - upset.loser);
  });

  it("places ratings into tiers", () => {
    expect(tierFor(START_RATING).name).toBe("Bronze");
    expect(tierFor(1099).key).toBe("bronze");
    expect(tierFor(1100).key).toBe("silver");
    expect(tierFor(1300).key).toBe("gold");
    expect(tierFor(1450).key).toBe("platinum");
    expect(tierFor(2000).key).toBe("diamond");
    expect(tierFor(-50).key).toBe("bronze");
  });

  it("pulls ratings halfway back to 1000 for a new season", () => {
    expect(seasonReset(1400)).toBe(1200);
    expect(seasonReset(800)).toBe(900);
    expect(seasonReset(1000)).toBe(1000);
    expect(seasonReset(1555)).toBe(1278);
  });
});
