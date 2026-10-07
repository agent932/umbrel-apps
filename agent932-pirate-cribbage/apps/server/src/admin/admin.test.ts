import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { matches } from "../db/schema.js";
import { credit } from "../economy/wallet.js";
import type { ServerMessage } from "../online/protocol.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { signUp, testApp } from "../test/testApp.js";
import { LONG, matchedPair, playOut } from "../test/wsClient.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp(undefined, LONG)));
afterEach(async () => t.close());

const api = (method: "GET" | "POST", url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
const me = async (cookie: string) => (await api("GET", "/api/auth/me", cookie)).json().user;
const login = (login: string, password: string) =>
  t.app.inject({ method: "POST", url: "/api/auth/login", payload: { login, password } });

describe("admin access", () => {
  it("makes the first account the admin, and nobody after", async () => {
    const captain = await signUp(t.app, "Captain");
    const crew = await signUp(t.app, "Crew");
    expect((await me(captain.cookie)).isAdmin).toBe(true);
    expect((await me(crew.cookie)).isAdmin).toBe(false);
  });

  it("keeps everyone else out of the admin API", async () => {
    await signUp(t.app, "Captain");
    const crew = await signUp(t.app, "Crew");
    for (const url of ["/api/admin/overview", "/api/admin/users", "/api/admin/games"]) {
      expect((await api("GET", url, crew.cookie)).statusCode).toBe(403);
      expect((await t.app.inject({ url })).statusCode).toBe(401);
    }
    expect((await api("POST", "/api/admin/seasons/end", crew.cookie)).statusCode).toBe(403);
  });
});

describe("players", () => {
  it("shows an overview and searchable player list", async () => {
    const captain = await signUp(t.app, "Captain");
    await signUp(t.app, "Bonny");
    const overview = (await api("GET", "/api/admin/overview", captain.cookie)).json();
    expect(overview).toMatchObject({
      players: 2,
      newPlayersThisWeek: 2,
      liveOnlineGames: 0,
      season: { name: "Season 1" },
    });
    const found = (await api("GET", "/api/admin/users?q=bon", captain.cookie)).json().users;
    expect(found).toMatchObject([
      { username: "Bonny", matches: 0, isAdmin: false, tier: "Bronze" },
    ]);
    expect(found[0]).not.toHaveProperty("passwordHash");
  });

  it("disables an account, signing it out everywhere, and enables it again", async () => {
    const captain = await signUp(t.app, "Captain");
    const bonny = await signUp(t.app, "Bonny");
    const id = (await me(bonny.cookie)).id;
    expect((await api("POST", `/api/admin/users/${id}/disable`, captain.cookie)).statusCode).toBe(
      200,
    );
    expect(await me(bonny.cookie)).toBeNull();
    const denied = await login("Bonny", "parrots-and-rum");
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toMatch(/disabled/);

    await api("POST", `/api/admin/users/${id}/enable`, captain.cookie);
    expect((await login("Bonny", "parrots-and-rum")).statusCode).toBe(200);
  });

  it("won't let an admin disable or demote themselves", async () => {
    const captain = await signUp(t.app, "Captain");
    const id = (await me(captain.cookie)).id;
    expect((await api("POST", `/api/admin/users/${id}/disable`, captain.cookie)).statusCode).toBe(
      400,
    );
    const demote = await api("POST", `/api/admin/users/${id}/admin`, captain.cookie, {
      isAdmin: false,
    });
    expect(demote.json().error).toMatch(/own admin/);
  });

  it("promotes another admin", async () => {
    const captain = await signUp(t.app, "Captain");
    const bonny = await signUp(t.app, "Bonny");
    await api("POST", `/api/admin/users/${(await me(bonny.cookie)).id}/admin`, captain.cookie, {
      isAdmin: true,
    });
    expect((await me(bonny.cookie)).isAdmin).toBe(true);
    expect((await api("GET", "/api/admin/overview", bonny.cookie)).statusCode).toBe(200);
  });

  it("resets a password to a one-time temporary one, which the player then changes", async () => {
    const captain = await signUp(t.app, "Captain");
    const bonny = await signUp(t.app, "Bonny");
    const id = (await me(bonny.cookie)).id;
    const { temporaryPassword } = (
      await api("POST", `/api/admin/users/${id}/reset-password`, captain.cookie)
    ).json();
    expect(temporaryPassword).toMatch(/^[a-z]+-[0-9A-F]{6}-[a-z]+$/);
    expect(await me(bonny.cookie)).toBeNull();
    expect((await login("Bonny", "parrots-and-rum")).statusCode).toBe(401);

    const res = await login("Bonny", temporaryPassword);
    expect(res.statusCode).toBe(200);
    const cookie = `pc_session=${res.cookies.find((c) => c.name === "pc_session")!.value}`;
    const wrong = await api("POST", "/api/auth/password", cookie, {
      current: "nope",
      next: "a-new-secret-1",
    });
    expect(wrong.statusCode).toBe(401);
    const ok = await api("POST", "/api/auth/password", cookie, {
      current: temporaryPassword,
      next: "a-new-secret-1",
    });
    expect(ok.statusCode).toBe(200);
    expect(await me(cookie)).not.toBeNull();
    expect((await login("Bonny", "a-new-secret-1")).statusCode).toBe(200);
  });
});

describe("doubloons", () => {
  /** The admin (first account) and a player. */
  async function crew() {
    const captain = await signUp(t.app, "Captain");
    const bonny = await signUp(t.app, "Bonny");
    return {
      captain: { ...captain, id: (await me(captain.cookie)).id as string },
      bonny: { ...bonny, id: (await me(bonny.cookie)).id as string },
    };
  }
  const adjust = (cookie: string, id: string, payload: object) =>
    api("POST", `/api/admin/users/${id}/doubloons`, cookie, {
      requestId: randomUUID(),
      ...payload,
    });

  it("keeps everyone else out", async () => {
    const { bonny } = await crew();
    for (const [method, url, payload] of [
      ["POST", `/api/admin/users/${bonny.id}/doubloons`, { delta: 5, note: "x" }],
      ["GET", `/api/admin/users/${bonny.id}/ledger`, undefined],
    ] as const) {
      expect((await api(method, url, bonny.cookie, payload)).statusCode).toBe(403);
      expect((await t.app.inject({ method, url, payload })).statusCode).toBe(401);
    }
    expect(await doubloonsOf(t.db, bonny.id)).toBe(0);
  });

  it("adds and removes doubloons with a reason, but never below zero", async () => {
    const { captain, bonny } = await crew();
    const add = await adjust(captain.cookie, bonny.id, { delta: 500, note: "Lost game refund" });
    expect(add.statusCode).toBe(200);
    expect(add.json()).toEqual({ doubloons: 500 });
    const [row] = await ledgerRows(t.db, bonny.id);
    expect(row).toMatchObject({ reason: "admin", delta: 500, note: "Lost game refund" });
    expect(row!.actorId).toBe(captain.id);
    const listed = (await api("GET", "/api/admin/users?q=bonny", captain.cookie)).json().users;
    expect(listed[0]).toMatchObject({ username: "Bonny", doubloons: 500 });

    const over = await adjust(captain.cookie, bonny.id, { delta: -600, note: "Oops" });
    expect(over.statusCode).toBe(409);
    expect(over.json().error).toMatch(/below zero/);
    expect(await doubloonsOf(t.db, bonny.id)).toBe(500);
    expect(await ledgerRows(t.db, bonny.id)).toHaveLength(1);

    expect((await adjust(captain.cookie, bonny.id, { delta: -200, note: "Fix" })).json()).toEqual({
      doubloons: 300,
    });
    await expectLedgerMatches(t.db);
  });

  it("checks the amount, the reason and the request id", async () => {
    const { captain, bonny } = await crew();
    for (const payload of [
      { delta: 0, note: "x" },
      { delta: 1.5, note: "x" },
      { delta: 100_001, note: "x" },
      { delta: -100_001, note: "x" },
      { delta: 5 },
      { delta: 5, note: "   " },
      { delta: 5, note: "x".repeat(201) },
      { delta: 5, note: "x", requestId: "not-a-uuid" },
    ]) {
      const res = await adjust(captain.cookie, bonny.id, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await adjust(captain.cookie, bonny.id, { delta: 100_000, note: "x" })).statusCode).toBe(
      200,
    );
    expect(await ledgerRows(t.db, bonny.id)).toHaveLength(1);
  });

  it("says when there's no such player", async () => {
    const { captain } = await crew();
    for (const id of [randomUUID(), "not-a-player"]) {
      expect((await adjust(captain.cookie, id, { delta: 5, note: "x" })).statusCode).toBe(404);
    }
    expect((await api("GET", "/api/admin/users/nope/ledger", captain.cookie)).statusCode).toBe(404);
  });

  it("applies two separate adjustments, but a retried one only once", async () => {
    const { captain, bonny } = await crew();
    await adjust(captain.cookie, bonny.id, { delta: 50, note: "Bonus" });
    await adjust(captain.cookie, bonny.id, { delta: 50, note: "Bonus" });
    expect(await doubloonsOf(t.db, bonny.id)).toBe(100);
    const requestId = randomUUID();
    const first = await adjust(captain.cookie, bonny.id, { delta: 70, note: "Once", requestId });
    const retry = await adjust(captain.cookie, bonny.id, { delta: 70, note: "Once", requestId });
    expect(first.json()).toEqual({ doubloons: 170 });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual({ doubloons: 170 });
    expect(await ledgerRows(t.db, bonny.id)).toHaveLength(3);
  });

  it("lets an admin adjust their own doubloons", async () => {
    const { captain } = await crew();
    const res = await adjust(captain.cookie, captain.id, { delta: 25, note: "Testing" });
    expect(res.json()).toEqual({ doubloons: 25 });
    expect((await me(captain.cookie)).doubloons).toBe(25);
  });

  it("shows a player's latest 100 ledger rows, newest first, with who made changes", async () => {
    const { captain, bonny } = await crew();
    const days = Array.from({ length: 105 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)));
    for (const [i, day] of days.entries()) {
      await credit(t.db, bonny.id, 10, "daily", day.toISOString().slice(0, 10), { now: day });
      if (i === 104) {
        await credit(t.db, bonny.id, -5, "admin", randomUUID(), {
          note: "Duplicate puzzle",
          actorId: captain.id,
          now: new Date(day.getTime() + 1000),
        });
      }
    }
    const { rows } = (
      await api("GET", `/api/admin/users/${bonny.id}/ledger`, captain.cookie)
    ).json();
    expect(rows).toHaveLength(100);
    expect(rows[0]).toMatchObject({
      delta: -5,
      reason: "admin",
      note: "Duplicate puzzle",
      actor: "Captain",
    });
    expect(rows[1]).toMatchObject({ reason: "daily", ref: "2026-04-15", actor: null });
    const times = rows.map((r: { createdAt: string }) => r.createdAt);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("shows the doubloons paid out today and the top earners on the overview", async () => {
    const { captain, bonny } = await crew();
    const cara = await signUp(t.app, "Cara");
    const caraId = (await me(cara.cookie)).id;
    const today = new Date().toISOString().slice(0, 10);
    await credit(t.db, bonny.id, 25, "daily", today);
    await credit(t.db, bonny.id, 50, "firstWinOfDay", today);
    await credit(t.db, caraId, 10, "daily", today);
    // Admin changes and yesterday's earnings don't count.
    await adjust(captain.cookie, captain.id, { delta: 1000, note: "Testing" });
    await credit(t.db, caraId, 500, "botWin", randomUUID(), {
      now: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const overview = (await api("GET", "/api/admin/overview", captain.cookie)).json();
    expect(overview.doubloonsIssuedToday).toBe(85);
    expect(overview.topEarnersToday).toEqual([
      { id: bonny.id, username: "Bonny", doubloons: 75 },
      { id: caraId, username: "Cara", doubloons: 10 },
    ]);
  });
});

describe("live games", () => {
  it("lists online games and ends a stuck one without recording it", async () => {
    const captain = await signUp(t.app, "Captain");
    const { gameId, a } = await matchedPair(t);
    const list = (await api("GET", "/api/admin/games", captain.cookie)).json().games;
    // Still cutting for deal, so no round has started yet.
    expect(list).toMatchObject([{ id: gameId, round: 0, phase: "cutForDeal", ranked: false }]);
    expect([...list[0].players].sort()).toEqual(["Anne", "Bonny"]);

    expect((await api("POST", `/api/admin/games/${gameId}/end`, captain.cookie)).statusCode).toBe(
      200,
    );
    expect(await a.next((m: ServerMessage) => m.t === "error")).toMatchObject({
      message: "An admin ended this game",
    });
    expect((await api("GET", "/api/admin/games", captain.cookie)).json().games).toEqual([]);
    expect(await t.db.select().from(matches).where(eq(matches.id, gameId))).toEqual([]);
  });
});

describe("seasons", () => {
  it("records ranked matches in the season, then ends it with final standings and a soft reset", async () => {
    const captain = await signUp(t.app, "Captain");
    const { gameId, a, b, anne, bonny } = await matchedPair(t, {
      variant: "classic",
      ranked: true,
    });
    const end = await playOut(gameId, [a, b]);
    const [match] = await t.db.select().from(matches).where(eq(matches.id, gameId));
    expect(match!.seasonId).toBe(1);

    const winner = end.names[end.step.view.winner!];
    const result = (await api("POST", "/api/admin/seasons/end", captain.cookie)).json();
    expect(result).toMatchObject({
      ended: { id: 1, players: 2 },
      started: { id: 2, name: "Season 2" },
    });

    const standings = (await api("GET", "/api/seasons/1/standings", anne.cookie)).json().standings;
    expect(
      standings.map((s: { rank: number; username: string; rating: number }) => [
        s.rank,
        s.username,
        s.rating,
      ]),
    ).toEqual([
      [1, winner, 1016],
      [2, winner === "Anne" ? "Bonny" : "Anne", 984],
    ]);

    // Ratings moved halfway back to 1000 and the new season starts with an empty board.
    const ratings = [(await me(anne.cookie)).rating, (await me(bonny.cookie)).rating].sort(
      (x, y) => x - y,
    );
    expect(ratings).toEqual([992, 1008]);
    expect((await me(anne.cookie)).rankedGames).toBe(0);
    const board = (await api("GET", "/api/leaderboard", anne.cookie)).json();
    expect(board).toMatchObject({ season: { id: 2, name: "Season 2" }, players: [] });
    const all = (await api("GET", "/api/seasons", anne.cookie)).json().seasons;
    expect(
      all.map((s: { name: string; endedAt: string | null }) => [s.name, s.endedAt === null]),
    ).toEqual([
      ["Season 2", true],
      ["Season 1", false],
    ]);
  }, 60_000);
});
