import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { matchPlayers } from "../db/schema.js";
import type { ServerMessage } from "../online/protocol.js";
import { signUp, testApp } from "../test/testApp.js";
import { LONG, connect, matchedPair, playOut } from "../test/wsClient.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp(undefined, LONG)));
afterEach(async () => t.close());

const api = (method: "GET" | "POST" | "DELETE", url: string, cookie: string, payload?: object) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

async function befriend(a: { cookie: string }, bName: string, b: { cookie: string }, aId: string) {
  await api("POST", "/api/friends/requests", a.cookie, { username: bName });
  await api("POST", `/api/friends/requests/${aId}/accept`, b.cookie);
}

const idOf = async (cookie: string) =>
  (await api("GET", "/api/auth/me", cookie)).json().user.id as string;

describe("friends", () => {
  it("sends a request by username, which the other player accepts", async () => {
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    const sent = await api("POST", "/api/friends/requests", anne.cookie, { username: "bonny" });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({
      accepted: false,
      friend: { username: "Bonny", tier: "Bronze" },
    });

    expect((await api("GET", "/api/friends", anne.cookie)).json()).toMatchObject({
      friends: [],
      outgoing: [{ username: "Bonny" }],
      incoming: [],
    });
    const bonnyView = (await api("GET", "/api/friends", bonny.cookie)).json();
    expect(bonnyView.incoming).toMatchObject([{ username: "Anne" }]);

    const accept = await api(
      "POST",
      `/api/friends/requests/${bonnyView.incoming[0].id}/accept`,
      bonny.cookie,
    );
    expect(accept.statusCode).toBe(200);
    expect((await api("GET", "/api/friends", anne.cookie)).json().friends).toMatchObject([
      { username: "Bonny", online: false },
    ]);
  });

  it("accepts automatically when both players ask each other", async () => {
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    await api("POST", "/api/friends/requests", anne.cookie, { username: "Bonny" });
    const back = await api("POST", "/api/friends/requests", bonny.cookie, { username: "Anne" });
    expect(back.json().accepted).toBe(true);
    expect((await api("GET", "/api/friends", anne.cookie)).json().friends).toHaveLength(1);
  });

  it.each([
    ["Ghost", /No pirate/],
    ["Anne", /own best mate/],
  ])("refuses a request to %s", async (username, error) => {
    const anne = await signUp(t.app, "Anne");
    const res = await api("POST", "/api/friends/requests", anne.cookie, { username });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(error);
  });

  it("refuses duplicate requests", async () => {
    const anne = await signUp(t.app, "Anne");
    await signUp(t.app, "Bonny");
    await api("POST", "/api/friends/requests", anne.cookie, { username: "Bonny" });
    const again = await api("POST", "/api/friends/requests", anne.cookie, { username: "Bonny" });
    expect(again.json().error).toMatch(/Already waiting/);
  });

  it("unfriends, and tells the other player's open tabs", async () => {
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    await befriend(anne, "Bonny", bonny, await idOf(anne.cookie));
    const tab = await connect(t.app, bonny.cookie);
    await tab.next((m) => m.t === "hello");
    expect((await api("GET", "/api/friends", anne.cookie)).json().friends[0].online).toBe(true);

    await api("DELETE", `/api/friends/${await idOf(bonny.cookie)}`, anne.cookie);
    expect(await tab.next((m) => m.t === "friends")).toEqual({ t: "friends" });
    expect((await api("GET", "/api/friends", bonny.cookie)).json().friends).toEqual([]);
  });

  it("needs an account", async () => {
    expect((await t.app.inject({ url: "/api/friends" })).statusCode).toBe(401);
  });
});

describe("challenges", () => {
  async function friendsOnline() {
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    await befriend(anne, "Bonny", bonny, await idOf(anne.cookie));
    const a = await connect(t.app, anne.cookie);
    const b = await connect(t.app, bonny.cookie);
    await a.next((m) => m.t === "hello");
    await b.next((m) => m.t === "hello");
    return { a, b, bonnyId: await idOf(bonny.cookie) };
  }

  it("lets a friend accept a challenge and starts the game for both", async () => {
    const { a, b, bonnyId } = await friendsOnline();
    a.send({ t: "challenge", friendId: bonnyId, menu: { variant: "pirate" } });
    await a.next((m) => m.t === "challengeSent");
    const c = await b.next<Extract<ServerMessage, { t: "challenge" }>>((m) => m.t === "challenge");
    expect(c.from.username).toBe("Anne");
    b.send({ t: "acceptChallenge", challengeId: c.challengeId });
    const { gameId } = await a.next<Extract<ServerMessage, { t: "matched" }>>(
      (m) => m.t === "matched",
    );
    expect(await b.next((m) => m.t === "matched")).toMatchObject({ gameId });
  });

  it("tells the challenger when it's declined", async () => {
    const { a, b, bonnyId } = await friendsOnline();
    a.send({ t: "challenge", friendId: bonnyId, menu: { variant: "classic" } });
    const c = await b.next<Extract<ServerMessage, { t: "challenge" }>>((m) => m.t === "challenge");
    b.send({ t: "declineChallenge", challengeId: c.challengeId });
    expect(await a.next((m) => m.t === "challengeDeclined")).toMatchObject({ by: "Bonny" });
    // It can't be accepted afterwards.
    b.send({ t: "acceptChallenge", challengeId: c.challengeId });
    expect(await b.next((m) => m.t === "error")).toMatchObject({
      message: expect.stringMatching(/no longer open/),
    });
  });

  it("only allows challenging friends who are online", async () => {
    const anne = await signUp(t.app, "Anne");
    const stranger = await signUp(t.app, "Stranger");
    const a = await connect(t.app, anne.cookie);
    a.send({ t: "challenge", friendId: await idOf(stranger.cookie), menu: { variant: "classic" } });
    expect(await a.next((m) => m.t === "error")).toMatchObject({
      message: "You can only challenge friends",
    });

    const bonny = await signUp(t.app, "Bonny");
    await befriend(anne, "Bonny", bonny, await idOf(anne.cookie));
    a.send({ t: "challenge", friendId: await idOf(bonny.cookie), menu: { variant: "classic" } });
    expect(await a.next((m) => m.t === "error")).toMatchObject({
      message: expect.stringMatching(/not online/),
    });
  });
});

describe("ranked play", () => {
  it("uses classic rules, moves ratings, and fills the Bronze column", async () => {
    const { gameId, a, b, sa, anne, bonny } = await matchedPair(t, {
      variant: "pirate",
      ranked: true,
    });
    expect(sa.step.view.rules.pirate).toBeUndefined();
    const end = await playOut(gameId, [a, b]);
    const winnerSeat = end.step.view.winner!;

    const me = async (cookie: string) => (await api("GET", "/api/auth/me", cookie)).json().user;
    const [ua, ub] = [await me(anne.cookie), await me(bonny.cookie)];
    expect([ua.rating, ub.rating].sort((x, y) => x - y)).toEqual([984, 1016]);
    expect(ua.rankedGames).toBe(1);
    const winnerName = end.names[winnerSeat];
    expect((winnerName === "Anne" ? ua : ub).rating).toBe(1016);

    const players = await t.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, gameId));
    expect(players.map((p) => [p.ratingBefore, p.tier])).toEqual([
      [1000, "bronze"],
      [1000, "bronze"],
    ]);

    const stats = (await api("GET", "/api/stats", anne.cookie)).json();
    const labels = stats.buckets.map((x: { label: string }) => x.label);
    expect(labels).toContain("Bronze");
    // 1016 is still Bronze, so there's no Silver column yet.
    expect(labels.filter((l: string) => ["Silver", "Gold"].includes(l))).toEqual([]);
    const bronze = stats.buckets.find((x: { key: string }) => x.key === "ranked-bronze").stats;
    expect(bronze.matchesPlayed).toBe(1);

    const board = (await api("GET", "/api/leaderboard", anne.cookie)).json().players;
    expect(board.map((p: { username: string; rank: number }) => [p.rank, p.username])).toEqual([
      [1, winnerName],
      [2, winnerName === "Anne" ? "Bonny" : "Anne"],
    ]);
  }, 60_000);

  it("only pairs ranked players with each other", async () => {
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    const a = await connect(t.app, anne.cookie);
    const b = await connect(t.app, bonny.cookie);
    a.send({ t: "queue", menu: { variant: "classic", ranked: true } });
    await a.next((m) => m.t === "queued");
    b.send({ t: "queue", menu: { variant: "classic" } });
    await b.next((m) => m.t === "queued");
    expect(a.messages.some((m) => m.t === "matched")).toBe(false);
  });
});

describe("head-to-head", () => {
  it("shows your record against a friend", async () => {
    const { gameId, a, b, anne, bonny } = await matchedPair(t);
    await befriend(anne, "Bonny", bonny, await idOf(anne.cookie));
    const end = await playOut(gameId, [a, b]);
    const bonnyId = await idOf(bonny.cookie);
    const res = await api("GET", `/api/friends/${bonnyId}/stats`, anne.cookie);
    expect(res.statusCode).toBe(200);
    const s = res.json().stats;
    expect(s.matchesPlayed).toBe(1);
    expect(s.wins).toBe(end.names[end.step.view.winner!] === "Anne" ? 1 : 0);

    const stranger = await signUp(t.app, "Stranger");
    const no = await api("GET", `/api/friends/${await idOf(stranger.cookie)}/stats`, anne.cookie);
    expect(no.statusCode).toBe(404);
  }, 60_000);
});
