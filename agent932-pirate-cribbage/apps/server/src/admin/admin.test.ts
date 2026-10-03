import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { matches } from "../db/schema.js";
import type { ServerMessage } from "../online/protocol.js";
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

describe("live games", () => {
  it("lists online games and ends a stuck one without recording it", async () => {
    const captain = await signUp(t.app, "Captain");
    const { gameId, a } = await matchedPair(t);
    const list = (await api("GET", "/api/admin/games", captain.cookie)).json().games;
    expect(list).toMatchObject([{ id: gameId, round: 1, ranked: false }]);
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
