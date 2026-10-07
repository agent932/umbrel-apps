import { afterEach, describe, expect, it, vi } from "vitest";
import { type LedgerReason, type WinNote, nextDailyReset } from "@pirate/engine";
import { lineLabel, newRequestId, noteText, resetTime } from "./economy.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("doubloon lines", () => {
  it("names every kind of payment", () => {
    const label = (reason: LedgerReason, key?: string) => lineLabel({ reason, key }, "medium");
    expect(label("botWin")).toBe("Beat Bosun Barnaby");
    expect(lineLabel({ reason: "botWin" }, "hard")).toBe("Beat Cap'n Bot");
    expect(lineLabel({ reason: "botWin" })).toBe("Win vs the computer");
    expect(label("onlineWin")).toBe("Online win");
    expect(label("rankedWin")).toBe("Ranked win");
    expect(label("skunk")).toBe("Skunk bonus");
    expect(label("skunk", "double")).toBe("Double skunk bonus");
    expect(label("firstWinOfDay")).toBe("First win of the day");
    expect(label("daily")).toBe("Daily discard");
    expect(label("daily", "best")).toBe("Best throw");
    expect(label("achievement", "firstWin")).toBe("First Plunder");
    expect(label("achievement", "power:spyglass")).toMatch(/Spyglass/);
    expect(label("achievement", "noSuchThing")).toBe("Achievement");
    expect(label("admin")).toBe("Adjustment");
  });
});

describe("why a win paid nothing or half", () => {
  const now = new Date("2026-10-06T15:30:00Z");
  const at = nextDailyReset(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  it("explains every note", () => {
    const text = (note: WinNote) => noteText(note, "Bonny", now);
    expect(text("short")).toBe("Games under 4 rounds or 3 minutes don't pay doubloons.");
    expect(text("earlyForfeit")).toBe("Early forfeits don't pay doubloons.");
    expect(text("lateForfeit")).toBe("Half bounty: your opponent abandoned ship.");
    expect(text("botCap")).toBe(
      `Daily bot bounty reached (10 wins). Online wins still pay. Resets at ${at}.`,
    );
    expect(text("onlineCap")).toBe(`Daily online bounty reached (10 wins). Resets at ${at}.`);
    expect(text("sameOpponent")).toBe(
      `You've had 3 paid wins against Bonny today. Resets at ${at}.`,
    );
  });

  it("gives the reset (00:00 UTC) in the player's own time", () => {
    const midnightUtc = new Date(Date.UTC(2026, 9, 7));
    expect(resetTime(now)).toBe(
      midnightUtc.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    );
  });
});

describe("request ids for admin adjustments", () => {
  it("makes a fresh v4 uuid each time", () => {
    const a = newRequestId();
    expect(a).toMatch(UUID);
    expect(newRequestId()).not.toBe(a);
  });

  it("still makes one on a plain http page, where crypto.randomUUID doesn't exist", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = newRequestId();
    expect(a).toMatch(UUID);
    expect(newRequestId()).not.toBe(a);
  });
});
