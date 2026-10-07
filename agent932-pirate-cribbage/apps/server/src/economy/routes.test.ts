import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIC_RULES } from "@pirate/engine";
import { recordMatch } from "../games/record.js";
import { playGame } from "../test/games.js";
import { expectLedgerMatches } from "../test/ledger.js";
import { signUp, testApp } from "../test/testApp.js";
import { credit } from "./wallet.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  t = await testApp();
});
afterEach(async () => {
  try {
    await expectLedgerMatches(t.db);
  } finally {
    vi.useRealTimers();
    await t.close();
  }
});

const wallet = (cookie: string) => t.app.inject({ url: "/api/wallet", headers: { cookie } });
async function player(name: string) {
  const { res, cookie } = await signUp(t.app, name);
  return { id: res.json().user.id as string, cookie };
}

describe("GET /api/wallet", () => {
  it("needs you signed in", async () => {
    expect((await t.app.inject({ url: "/api/wallet" })).statusCode).toBe(401);
  });

  it("starts at zero with today's limits untouched", async () => {
    const { cookie } = await player("Anne");
    expect((await wallet(cookie)).json()).toEqual({
      doubloons: 0,
      today: {
        day: "2026-10-06",
        resetsAt: "2026-10-07T00:00:00.000Z",
        botWinsPaid: 0,
        botWinCap: 10,
        onlineWinsPaid: 0,
        onlineWinCap: 10,
        firstWinOfDayPaid: false,
      },
      recent: [],
    });
  });

  it("lists the latest changes newest first, keeping admin details to Admin", async () => {
    const captain = await player("Captain");
    const anne = await player("Anne");
    const game = playGame(CLASSIC_RULES, 3);
    await recordMatch(
      t.db,
      {
        id: randomUUID(),
        mode: "ai",
        aiLevel: "hard",
        createdAt: new Date(Date.now() - 10 * 60_000),
      },
      game.winner === 0 ? [anne.id, null] : [null, anne.id],
      game,
    );
    vi.setSystemTime(new Date("2026-10-06T12:05:00Z"));
    const adjust = await t.app.inject({
      method: "POST",
      url: `/api/admin/users/${anne.id}/doubloons`,
      headers: { cookie: captain.cookie },
      payload: { delta: 100, note: "Tournament prize", requestId: randomUUID() },
    });
    expect(adjust.statusCode).toBe(200);

    const body = (await wallet(anne.cookie)).json();
    expect(body.today).toMatchObject({ botWinsPaid: 1, firstWinOfDayPaid: true });
    expect(body.recent[0]).toEqual({
      delta: 100,
      reason: "admin",
      ref: null,
      createdAt: "2026-10-06T12:05:00.000Z",
    });
    expect(body.recent.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "botWin", delta: 50 }),
        expect.objectContaining({ reason: "firstWinOfDay", delta: 50, ref: "2026-10-06" }),
        expect.objectContaining({ reason: "achievement", ref: "firstWin" }),
      ]),
    );
    for (const row of body.recent) expect(row).not.toHaveProperty("note");
    expect(body.doubloons).toBe(
      body.recent.reduce((s: number, r: { delta: number }) => s + r.delta, 0),
    );
  });

  it("shows only the latest 20, and counts today from midnight UTC", async () => {
    const { id, cookie } = await player("Anne");
    for (let i = 0; i < 25; i++) await credit(t.db, id, 35, "botWin", randomUUID());
    const today = (await wallet(cookie)).json();
    expect(today.recent).toHaveLength(20);
    expect(today.today.botWinsPaid).toBe(25);
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));
    const tomorrow = (await wallet(cookie)).json();
    expect(tomorrow.today).toMatchObject({ day: "2026-10-07", botWinsPaid: 0 });
    expect(tomorrow.doubloons).toBe(25 * 35);
  });
});
