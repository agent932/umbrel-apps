import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardLabel, dailyDeal, rankDiscards } from "@pirate/engine";
import { signUp, testApp } from "../test/testApp.js";
import { addDays, isOpenDay } from "./routes.js";

let t: Awaited<ReturnType<typeof testApp>>;
let cookie: string;
beforeEach(async () => {
  // Only the clock is faked, so each test can step through the days.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  t = await testApp();
  cookie = (await signUp(t.app, "Anne")).cookie;
});
afterEach(async () => {
  await t.close();
  vi.useRealTimers();
});

/** The best (index 0) or worst (index 14) throw for a day, as card labels. */
const throwFor = (day: string, index: number) => {
  const { hand, isDealer } = dailyDeal(day);
  return rankDiscards(hand, isDealer).at(index)!.discard.map(cardLabel);
};
const best = (day: string) => throwFor(day, 0);
const worst = (day: string) => throwFor(day, -1);

const play = (day: string, cards: string[], as = cookie) =>
  t.app.inject({
    method: "POST",
    url: "/api/daily",
    headers: { cookie: as },
    payload: { day, cards },
  });
const look = (day?: string) =>
  t.app.inject({ url: `/api/daily${day ? `?day=${day}` : ""}`, headers: { cookie } });

/** Play `day` at midday UTC on that day. */
async function playOn(day: string, cards: string[]) {
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  return play(day, cards);
}

describe("daily discard on the server", () => {
  it("ranks the throw itself from the day's deal", async () => {
    const top = await play("2026-10-04", best("2026-10-04"));
    expect(top.statusCode).toBe(200);
    expect(top.json()).toMatchObject({ result: { best: true, rank: 1, score: 100 }, streak: 1 });

    vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
    const bottom = await play("2026-10-05", worst("2026-10-05"));
    expect(bottom.json().result).toMatchObject({ best: false, score: 0 });
    expect(bottom.json().result.bestDiscard).toEqual(best("2026-10-05"));
    expect(bottom.json().streak).toBe(0);
  });

  it("rejects cards that aren't in the hand, or the same card twice", async () => {
    const hand = dailyDeal("2026-10-04").hand.map(cardLabel);
    const outside = ["AS", "2S", "3S", "4S", "5S", "6S", "7S", "8S"].find(
      (c) => !hand.includes(c),
    )!;
    expect((await play("2026-10-04", [hand[0]!, outside])).statusCode).toBe(400);
    expect((await play("2026-10-04", [hand[0]!, hand[0]!])).statusCode).toBe(400);
    expect((await play("2026-10-04", ["nope", hand[0]!])).statusCode).toBe(400);
    expect((await play("2026-10-04", [hand[0]!])).statusCode).toBe(400);
  });

  it("counts only the first answer for a day", async () => {
    expect((await play("2026-10-04", worst("2026-10-04"))).statusCode).toBe(200);
    const again = await play("2026-10-04", best("2026-10-04"));
    expect(again.statusCode).toBe(409);
    const seen = (await look("2026-10-04")).json();
    expect(seen.result).toMatchObject({ discard: worst("2026-10-04"), best: false });
    expect(seen.streak).toBe(0);
  });

  it("only takes yesterday, today or tomorrow (UTC), for players in any time zone", async () => {
    expect(isOpenDay("2026-10-03", "2026-10-04")).toBe(true);
    expect(isOpenDay("2026-10-05", "2026-10-04")).toBe(true);
    expect(isOpenDay("2026-02-30", "2026-03-01")).toBe(false);
    expect((await play("2026-10-02", best("2026-10-02"))).statusCode).toBe(400);
    expect((await play("2026-10-06", best("2026-10-06"))).statusCode).toBe(400);
    expect((await play("2026-10-03", best("2026-10-03"))).statusCode).toBe(200);
    expect((await play("2026-10-05", best("2026-10-05"))).statusCode).toBe(200);
  });

  it("keeps the streak through today if you haven't played yet, and restarts it after a gap", async () => {
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) await playOn(day, best(day));
    vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
    // Not played today yet: yesterday's streak still stands.
    expect((await look("2026-10-04")).json()).toMatchObject({ result: null, streak: 3 });
    // Skip the 4th; on the 6th the old streak is gone.
    vi.setSystemTime(new Date("2026-10-06T08:00:00Z"));
    expect((await look("2026-10-06")).json().streak).toBe(0);
    expect((await play("2026-10-06", best("2026-10-06"))).json().streak).toBe(1);
    expect((await look()).json()).toMatchObject({ day: "2026-10-06", streak: 1 });
  });

  it("awards Sharp Eye for 7 best throws in a row, once", async () => {
    const days = Array.from({ length: 8 }, (_, i) => addDays("2026-10-01", i));
    const unlocked: string[][] = [];
    for (const day of days) {
      const res = (await playOn(day, best(day))).json();
      unlocked.push(res.unlocked);
    }
    expect(unlocked.slice(0, 6).flat()).toEqual([]);
    expect(unlocked[6]).toEqual(["sharpEye"]);
    expect(unlocked[7]).toEqual([]);
    const earned = (await t.app.inject({ url: "/api/achievements", headers: { cookie } })).json();
    expect(earned.achievements.map((a: { key: string }) => a.key)).toEqual(["sharpEye"]);
  });

  it("needs you signed in", async () => {
    expect((await t.app.inject({ url: "/api/daily" })).statusCode).toBe(401);
    expect((await play("2026-10-04", best("2026-10-04"), "")).statusCode).toBe(401);
  });
});
