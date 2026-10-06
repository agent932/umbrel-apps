import { afterEach, describe, expect, it } from "vitest";
import { signUp, testApp } from "../test/testApp.js";
import { LONG, connect, matchedPair } from "../test/wsClient.js";
import type { ServerMessage } from "../online/protocol.js";
import { isOffensiveName } from "./names.js";

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

type App = typeof t.app;
const call = (
  app: App,
  cookie: string,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, headers: { cookie }, payload });

describe("username filter", () => {
  it("catches swear words, including split and disguised ones, but not innocent names", () => {
    for (const bad of ["FuckFace", "f_u_c_k", "Sh1tLord", "Big_Tits"])
      expect(isOffensiveName(bad)).toBe(true);
    for (const ok of ["CaroS", "Scunthorpe", "Cockburn", "SwabbieSal", "Arsenal", "Dickens99"])
      expect(isOffensiveName(ok)).toBe(false);
  });

  it("refuses an offensive username at sign up", async () => {
    t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { username: "Sh1tLord", email: "s@example.test", password: "parrots-and-rum" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Please pick a different username");
  });
});

describe("blocking", () => {
  it("blocks and unblocks by username, and lists who you've blocked", async () => {
    t = await testApp();
    const anne = await signUp(t.app, "Anne");
    await signUp(t.app, "Bonny");
    expect((await call(t.app, anne.cookie, "POST", "/api/players/bonny/block")).statusCode).toBe(
      200,
    );
    // Twice is fine.
    expect((await call(t.app, anne.cookie, "POST", "/api/players/Bonny/block")).statusCode).toBe(
      200,
    );
    expect((await call(t.app, anne.cookie, "GET", "/api/blocks")).json().blocked).toEqual([
      { id: expect.any(String), username: "Bonny" },
    ]);
    await call(t.app, anne.cookie, "DELETE", "/api/players/Bonny/block");
    expect((await call(t.app, anne.cookie, "GET", "/api/blocks")).json().blocked).toEqual([]);
  });

  it("needs a signed-in player and a real other player", async () => {
    t = await testApp();
    const anne = await signUp(t.app, "Anne");
    expect(
      (await t.app.inject({ method: "POST", url: "/api/players/Anne/block" })).statusCode,
    ).toBe(401);
    expect((await call(t.app, anne.cookie, "POST", "/api/players/Anne/block")).statusCode).toBe(
      404,
    );
    expect((await call(t.app, anne.cookie, "POST", "/api/players/Nobody/block")).statusCode).toBe(
      404,
    );
  });

  it("ends a friendship and stops friend requests both ways", async () => {
    t = await testApp();
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    await call(t.app, anne.cookie, "POST", "/api/friends/requests", { username: "Bonny" });
    await call(t.app, bonny.cookie, "POST", "/api/friends/requests", { username: "Anne" });
    expect((await call(t.app, anne.cookie, "GET", "/api/friends")).json().friends).toHaveLength(1);

    await call(t.app, anne.cookie, "POST", "/api/players/Bonny/block");
    expect((await call(t.app, anne.cookie, "GET", "/api/friends")).json().friends).toHaveLength(0);
    const fromBonny = await call(t.app, bonny.cookie, "POST", "/api/friends/requests", {
      username: "Anne",
    });
    expect(fromBonny.statusCode).toBe(400);
    expect(fromBonny.json().error).toBe("Anne isn't taking friend requests");
    const fromAnne = await call(t.app, anne.cookie, "POST", "/api/friends/requests", {
      username: "Bonny",
    });
    expect(fromAnne.json().error).toMatch(/unblock them/);
  });

  it("never pairs blocked players in Quick Match, but pairs them with others", async () => {
    t = await testApp(undefined, LONG);
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    const carl = await signUp(t.app, "Carl");
    await call(t.app, anne.cookie, "POST", "/api/players/Bonny/block");
    const a = await connect(t.app, anne.cookie);
    const b = await connect(t.app, bonny.cookie);
    const c = await connect(t.app, carl.cookie);
    for (const x of [a, b, c]) await x.next((m) => m.t === "hello");
    const menu = { variant: "classic" };
    a.send({ t: "queue", menu });
    await a.next((m) => m.t === "queued");
    b.send({ t: "queue", menu });
    await b.next((m) => m.t === "queued");
    expect(a.messages.some((m) => m.t === "matched")).toBe(false);
    // Carl takes the longest-waiting player he may play: Anne.
    c.send({ t: "queue", menu });
    const matched = await c.next<Extract<ServerMessage, { t: "matched" }>>(
      (m) => m.t === "matched",
    );
    expect(await a.next((m) => m.t === "matched")).toEqual(matched);
    expect(b.messages.some((m) => m.t === "matched")).toBe(false);
  });

  it("refuses an invite from someone who blocked you", async () => {
    t = await testApp(undefined, LONG);
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    await call(t.app, anne.cookie, "POST", "/api/players/Bonny/block");
    const a = await connect(t.app, anne.cookie);
    const b = await connect(t.app, bonny.cookie);
    a.send({ t: "createInvite", menu: { variant: "classic" } });
    const { code } = await a.next<Extract<ServerMessage, { t: "invite" }>>((m) => m.t === "invite");
    b.send({ t: "joinInvite", code });
    expect(await b.next((m) => m.t === "error")).toMatchObject({
      message: "That invite isn't available",
    });
  });

  it("hides a blocked player's emotes from the player who blocked them", async () => {
    t = await testApp(undefined, LONG);
    const { gameId, a, b, sa } = await matchedPair(t, { variant: "classic" });
    const anne = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "Anne", password: "parrots-and-rum" },
    });
    const cookie = `pc_session=${anne.cookies.find((x) => x.name === "pc_session")!.value}`;
    await call(t.app, cookie, "POST", "/api/players/Bonny/block");
    b.send({ t: "emote", gameId, emote: "arr" });
    // Bonny sees her own call-out as usual...
    await b.next((m) => m.t === "emote");
    // ...and Anne, who'd see her own, never gets Bonny's.
    a.send({ t: "emote", gameId, emote: "ahoy" });
    const own = await a.next<Extract<ServerMessage, { t: "emote" }>>((m) => m.t === "emote");
    expect(own.seat).toBe(sa.seat);
    expect(a.messages.filter((m) => m.t === "emote")).toHaveLength(1);
  });
});

describe("reporting", () => {
  it("puts a report in the admin's support inbox", async () => {
    t = await testApp();
    const admin = await signUp(t.app, "Captain");
    const anne = await signUp(t.app, "Anne");
    await signUp(t.app, "Bonny");
    const res = await call(t.app, anne.cookie, "POST", "/api/players/Bonny/report", {
      reason: "name",
      note: "Rude name",
    });
    expect(res.statusCode).toBe(201);
    const inbox = (await call(t.app, admin.cookie, "GET", "/api/admin/support")).json().messages;
    expect(inbox).toEqual([
      expect.objectContaining({
        topic: "report",
        name: "Anne",
        username: "Anne",
        message: "Reported player: Bonny\nReason: Offensive username\nNote: Rude name",
      }),
    ]);
  });

  it("checks the reason and who's reported", async () => {
    t = await testApp();
    const anne = await signUp(t.app, "Anne");
    await signUp(t.app, "Bonny");
    expect(
      (await call(t.app, anne.cookie, "POST", "/api/players/Bonny/report", { reason: "boring" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call(t.app, anne.cookie, "POST", "/api/players/Nobody/report", { reason: "name" }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await t.app.inject({
          method: "POST",
          url: "/api/players/Bonny/report",
          payload: { reason: "name" },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("keeps 'report' off the public contact form", async () => {
    t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/support",
      payload: {
        name: "X",
        email: "x@example.test",
        topic: "report",
        message: "ten characters at least",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
