import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Email, EmailSettings } from "./mailer.js";
import { signUp, testApp } from "../test/testApp.js";
import { LONG, connect } from "../test/wsClient.js";
import type { ServerMessage } from "../online/protocol.js";

let t: Awaited<ReturnType<typeof testApp>>;
let sent: { config: EmailSettings; email: Email }[];
beforeEach(async () => {
  sent = [];
  t = await testApp(undefined, LONG, undefined, undefined, async (config, email) => {
    sent.push({ config, email });
  });
});
afterEach(async () => t.close());

const KEY = "re_test_0123456789abcd";
const json = (method: "GET" | "POST" | "PUT", url: string, cookie?: string, payload?: object) =>
  t.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload ? { payload } : {}) });

async function setUpEmail() {
  const captain = await signUp(t.app, "Captain");
  const res = await json("PUT", "/api/admin/email", captain.cookie, {
    apiKey: KEY,
    from: "Deckhand Games <crew@deckhand.games>",
    siteUrl: "https://deckhand.games/",
  });
  expect(res.statusCode).toBe(200);
  return captain;
}

describe("email settings", () => {
  it("are for admins only, and never hand the key back", async () => {
    const captain = await signUp(t.app, "Captain");
    const crew = await signUp(t.app, "Crew");
    expect((await json("GET", "/api/admin/email", crew.cookie)).statusCode).toBe(403);
    expect((await json("GET", "/api/email/enabled")).json()).toEqual({ enabled: false });

    await json("PUT", "/api/admin/email", captain.cookie, {
      apiKey: KEY,
      from: "Deckhand Games <crew@deckhand.games>",
      siteUrl: "https://deckhand.games/",
    });
    const shown = await json("GET", "/api/admin/email", captain.cookie);
    expect(shown.json()).toEqual({
      configured: true,
      keyHint: "abcd",
      from: "Deckhand Games <crew@deckhand.games>",
      siteUrl: "https://deckhand.games",
    });
    expect(shown.body).not.toContain(KEY);
    expect((await json("GET", "/api/email/enabled")).json()).toEqual({ enabled: true });

    // Saving again without a key keeps the old one.
    await json("PUT", "/api/admin/email", captain.cookie, {
      from: "Crew <crew@deckhand.games>",
      siteUrl: "https://deckhand.games",
    });
    expect((await json("GET", "/api/admin/email", captain.cookie)).json().keyHint).toBe("abcd");

    const test = await json("POST", "/api/admin/email/test", captain.cookie);
    expect(test.json()).toMatchObject({ ok: true });
    expect(sent.at(-1)!.config.apiKey).toBe(KEY);
  });
});

describe("password reset", () => {
  it("emails a one-time link that sets a new password and signs out everywhere", async () => {
    await setUpEmail();
    const anne = await signUp(t.app, "Anne");
    expect((await json("POST", "/api/auth/forgot", undefined, { login: "ANNE" })).json()).toEqual({
      ok: true,
    });
    const mail = sent.at(-1)!.email;
    expect(mail.to).toBe("anne@example.test");
    const token = /https:\/\/deckhand\.games\/reset\/([\w-]+)/.exec(mail.text)![1]!;

    const reset = await json("POST", "/api/auth/reset", undefined, {
      token,
      password: "a-brand-new-secret",
    });
    expect(reset.statusCode).toBe(200);
    expect((await json("GET", "/api/auth/me", anne.cookie)).json().user).toBeNull();
    expect(
      (
        await json("POST", "/api/auth/login", undefined, {
          login: "Anne",
          password: "a-brand-new-secret",
        })
      ).statusCode,
    ).toBe(200);
    // Links work once.
    const again = await json("POST", "/api/auth/reset", undefined, {
      token,
      password: "another-one-1",
    });
    expect(again.statusCode).toBe(400);
  });

  it("gives nothing away about who has an account", async () => {
    await setUpEmail();
    const before = sent.length;
    const res = await json("POST", "/api/auth/forgot", undefined, { login: "nobody-here" });
    expect(res.json()).toEqual({ ok: true });
    expect(sent.length).toBe(before);
  });
});

describe("emailed invites", () => {
  it("sends your own live invite link, and nobody else's", async () => {
    await setUpEmail();
    const anne = await signUp(t.app, "Anne");
    const bonny = await signUp(t.app, "Bonny");
    const host = await connect(t.app, anne.cookie);
    host.send({ t: "createInvite", menu: { variant: "classic" } });
    const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
      (m) => m.t === "invite",
    );

    const ok = await json("POST", "/api/invites/email", anne.cookie, {
      code,
      to: "Friend@Example.test",
    });
    expect(ok.statusCode).toBe(200);
    const mail = sent.at(-1)!.email;
    expect(mail.to).toBe("friend@example.test");
    expect(mail.subject).toMatch(/Anne invites you/);
    expect(mail.text).toContain(`https://deckhand.games/join/${code}`);

    const theirs = await json("POST", "/api/invites/email", bonny.cookie, {
      code,
      to: "x@example.test",
    });
    expect(theirs.statusCode).toBe(400);
  });
});
