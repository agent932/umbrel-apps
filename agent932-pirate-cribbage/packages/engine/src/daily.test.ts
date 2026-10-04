import { describe, expect, it } from "vitest";
import { cardLabel } from "./cards.js";
import { dailyDeal } from "./daily.js";

describe("dailyDeal", () => {
  it("deals the same six cards to everyone on a day, and a different hand the next day", () => {
    const today = dailyDeal("2026-10-04");
    expect(today.hand).toHaveLength(6);
    expect(new Set(today.hand.map(cardLabel)).size).toBe(6);
    expect(dailyDeal("2026-10-04")).toEqual(today);
    expect(dailyDeal("2026-10-05").hand.map(cardLabel)).not.toEqual(today.hand.map(cardLabel));
  });
});
