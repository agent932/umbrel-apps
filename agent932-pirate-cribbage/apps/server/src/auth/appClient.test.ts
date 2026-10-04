import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUp, testApp } from "../test/testApp.js";
import { connect } from "../test/wsClient.js";
import type { ServerMessage } from "../online/protocol.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

const APP = { origin: "capacitor://localhost", "x-deckhand-client": "app" };

async function appLogin() {
  await signUp(t.app, "Anne");
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: APP,
    payload: { login: "Anne", password: "parrots-and-rum" },
  });
  return res;
}

describe("the iPhone app", () => {
  it("signs in with a token instead of a cookie, and uses it as a bearer token", async () => {
    const res = await appLogin();
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveLength(0);
    const { token } = res.json() as { token: string };
    expect(token).toMatch(/^[\w-]{40,}$/);
    expect(res.headers["access-control-allow-origin"]).toBe("capacitor://localhost");

    const me = await t.app.inject({
      url: "/api/auth/me",
      headers: { ...APP, authorization: `Bearer ${token}` },
    });
    expect(me.json().user).toMatchObject({ username: "Anne" });

    await t.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { ...APP, authorization: `Bearer ${token}` },
      payload: {},
    });
    const after = await t.app.inject({
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.json().user).toBeNull();
  });

  it("answers the app's CORS preflight, but not other sites'", async () => {
    const ok = await t.app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: { origin: "capacitor://localhost", "access-control-request-method": "POST" },
    });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-headers"]).toContain("authorization");
    const other = await t.app.inject({
      url: "/api/auth/me",
      headers: { origin: "https://evil.example" },
    });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("web sign-in still uses only the cookie", async () => {
    const { res } = await signUp(t.app, "Bonny");
    expect(res.json()).not.toHaveProperty("token");
  });

  it("opens the game socket with the token as a subprotocol", async () => {
    const { token } = (await appLogin()).json() as { token: string };
    const c = await connect(t.app, {
      origin: "capacitor://localhost",
      "sec-websocket-protocol": `deckhand, bearer.${token}`,
    });
    c.send({ t: "createInvite", menu: { variant: "classic" } });
    const invite = await c.next<Extract<ServerMessage, { t: "invite" }>>((m) => m.t === "invite");
    expect(invite.code).toMatch(/^[A-Z2-9]{6}$/);
  });
});
