import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { passwordResets, users } from "../db/schema.js";
import { signUp, testApp } from "../test/testApp.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

const change = (headers: Record<string, string>, payload: object) =>
  t.app.inject({ method: "POST", url: "/api/auth/email", headers, payload });

/** A second sign-in for the same player (another browser). */
async function loginAgain(login = "CaroS") {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { login, password: "parrots-and-rum" },
  });
  return `pc_session=${res.cookies.find((c) => c.name === "pc_session")!.value}`;
}

describe("changing your email", () => {
  it("checks your password, saves the new email in lower case, and /me shows it", async () => {
    const { cookie } = await signUp(t.app);
    const wrong = await change({ cookie }, { password: "nope", email: "new@example.test" });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error).toBe("That password isn't right");

    const res = await change(
      { cookie },
      { password: "parrots-and-rum", email: "  Captain.Caro@Example.TEST " },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      username: "CaroS",
      email: "captain.caro@example.test",
    });
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user.email).toBe("captain.caro@example.test");

    // You can sign in with the new email, and not the old one.
    const byNew = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "CAPTAIN.caro@example.test", password: "parrots-and-rum" },
    });
    expect(byNew.statusCode).toBe(200);
    const byOld = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "caros@example.test", password: "parrots-and-rum" },
    });
    expect(byOld.statusCode).toBe(401);
  });

  it("refuses an email someone else has, whatever its case", async () => {
    const { cookie } = await signUp(t.app, "CaroS");
    await signUp(t.app, "Bosun");
    const res = await change(
      { cookie },
      { password: "parrots-and-rum", email: "BOSUN@example.test" },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("That email is already taken");
    const [row] = await t.db.select().from(users).where(eq(users.username, "CaroS"));
    expect(row!.email).toBe("caros@example.test");
  });

  it.each([
    [{ password: "parrots-and-rum", email: "not-an-email" }, 400, /doesn't look right/],
    [{ password: "parrots-and-rum", email: "CaroS@example.test" }, 400, /already your email/],
    [{ email: "new@example.test" }, 400, undefined],
  ])("validates the request %#", async (payload, status, message) => {
    const { cookie } = await signUp(t.app);
    const res = await change({ cookie }, payload);
    expect(res.statusCode).toBe(status);
    if (message) expect(res.json().error).toMatch(message);
  });

  it("needs you signed in", async () => {
    const res = await change({}, { password: "parrots-and-rum", email: "new@example.test" });
    expect(res.statusCode).toBe(401);
  });

  it("signs out your other sessions, keeps this one, and voids reset links sent to the old email", async () => {
    const { cookie, res: signup } = await signUp(t.app);
    const other = await loginAgain();
    const userId = signup.json().user.id as string;
    await t.db.insert(passwordResets).values({
      tokenHash: "old-link",
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const res = await change(
      { cookie },
      { password: "parrots-and-rum", email: "new@example.test" },
    );
    expect(res.statusCode).toBe(200);
    const here = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(here.json().user.email).toBe("new@example.test");
    const there = await t.app.inject({ url: "/api/auth/me", headers: { cookie: other } });
    expect(there.json().user).toBeNull();
    expect(await t.db.select().from(passwordResets)).toHaveLength(0);
  });

  it("works for the iPhone app's bearer token", async () => {
    await signUp(t.app, "Anne");
    const APP = { origin: "capacitor://localhost", "x-deckhand-client": "app" };
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: APP,
      payload: { login: "Anne", password: "parrots-and-rum" },
    });
    const auth = { ...APP, authorization: `Bearer ${login.json().token as string}` };
    const res = await change(auth, { password: "parrots-and-rum", email: "anne@ship.test" });
    expect(res.statusCode).toBe(200);
    const me = await t.app.inject({ url: "/api/auth/me", headers: auth });
    expect(me.json().user).toMatchObject({ username: "Anne", email: "anne@ship.test" });
  });
});
