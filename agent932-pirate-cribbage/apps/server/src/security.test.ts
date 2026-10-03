import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { needsRehash } from "./auth/password.js";
import { users } from "./db/schema.js";
import { MAX_MESSAGES_PER_10S, sameOrigin } from "./online/routes.js";
import { signUp, testApp } from "./test/testApp.js";
import { LONG, connect } from "./test/wsClient.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp(undefined, LONG)));
afterEach(async () => t.close());

describe("security headers", () => {
  it("sends a strict content security policy and the usual protections", async () => {
    const res = await t.app.inject({ url: "/api/health" });
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com");
    expect(csp).toContain("https://cloudflareinsights.com");
    // Inline scripts stay blocked.
    expect(csp.split(";").find((d) => d.startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=/);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("errors", () => {
  it("never shows the browser what went wrong inside the server", async () => {
    t.app.get("/api/boom", async () => {
      throw new Error("connection to postgres://pirate:hunter2@db failed");
    });
    const res = await t.app.inject({ url: "/api/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Something went wrong" });
    expect(res.body).not.toContain("hunter2");
  });

  it("still explains client mistakes", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("game socket", () => {
  it("accepts the game's own pages and non-browser clients", () => {
    expect(sameOrigin("https://pc.atomicit.ca", { host: "pc.atomicit.ca" })).toBe(true);
    expect(sameOrigin("http://192.168.1.5:8121", { host: "192.168.1.5:8121" })).toBe(true);
    expect(
      sameOrigin("https://pc.atomicit.ca", {
        host: "web:3000",
        "x-forwarded-host": "pc.atomicit.ca",
      }),
    ).toBe(true);
    expect(sameOrigin(undefined, { host: "pc.atomicit.ca" })).toBe(true);
  });

  it("refuses other websites, even on the same domain", () => {
    expect(sameOrigin("https://overseerr.atomicit.ca", { host: "pc.atomicit.ca" })).toBe(false);
    expect(sameOrigin("https://evil.example", { host: "pc.atomicit.ca" })).toBe(false);
    expect(sameOrigin("not a url", { host: "pc.atomicit.ca" })).toBe(false);
  });

  it("hangs up on a socket opened by another site", async () => {
    const { cookie } = await signUp(t.app, "Anne");
    const ws = await t.app.injectWS("/api/ws", {
      headers: { cookie, origin: "https://evil.example" },
    });
    const code = await new Promise<number>((r) => ws.on("close", (c: number) => r(c)));
    expect(code).toBe(4403);
  });

  it("hangs up on a flood of messages", async () => {
    // This app uses the real limit.
    await t.close();
    t = await testApp(undefined, LONG, MAX_MESSAGES_PER_10S);
    const { cookie } = await signUp(t.app, "Anne");
    const c = await connect(t.app, cookie);
    await c.next((m) => m.t === "hello");
    for (let i = 0; i < 70; i++) c.send({ t: "cancelQueue" });
    expect(await c.closed).toBe(4429);
  });

  it("hangs up on a player the moment an admin disables them", async () => {
    const captain = await signUp(t.app, "Captain");
    const anne = await signUp(t.app, "Anne");
    const c = await connect(t.app, anne.cookie);
    await c.next((m) => m.t === "hello");
    const id = (
      await t.app.inject({ url: "/api/auth/me", headers: { cookie: anne.cookie } })
    ).json().user.id;
    await t.app.inject({
      method: "POST",
      url: `/api/admin/users/${id}/disable`,
      headers: { cookie: captain.cookie },
    });
    expect(await c.next((m) => m.t === "error")).toMatchObject({
      message: "This account has been disabled",
    });
    expect(await c.closed).toBe(4403);
  });
});

describe("password hashing", () => {
  it("upgrades an older, weaker hash the next time the player signs in", async () => {
    await signUp(t.app, "Anne");
    // Store a hash made with the old settings (N = 2^14).
    const salt = randomBytes(16);
    const weak = scryptSync("parrots-and-rum", salt, 64, { N: 16384, r: 8, p: 1 });
    const old = ["scrypt", 16384, 8, 1, salt.toString("base64"), weak.toString("base64")].join("$");
    await t.db.update(users).set({ passwordHash: old }).where(eq(users.username, "Anne"));
    expect(needsRehash(old)).toBe(true);

    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "Anne", password: "parrots-and-rum" },
    });
    expect(res.statusCode).toBe(200);
    const [row] = await t.db.select().from(users).where(eq(users.username, "Anne"));
    expect(row!.passwordHash.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(needsRehash(row!.passwordHash)).toBe(false);
  });
});

describe("friend requests", () => {
  it("are rate-limited", async () => {
    const { cookie } = await signUp(t.app, "Anne");
    let last = 0;
    for (let i = 0; i < 22; i++) {
      last = (
        await t.app.inject({
          method: "POST",
          url: "/api/friends/requests",
          headers: { cookie },
          payload: { username: "Nobody" },
        })
      ).statusCode;
    }
    expect(last).toBe(429);
  });
});
