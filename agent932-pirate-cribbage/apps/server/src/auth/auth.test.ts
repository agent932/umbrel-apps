import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUp, testApp } from "../test/testApp.js";
import { hashPassword, verifyPassword } from "./password.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("yo-ho-ho");
    const b = await hashPassword("yo-ho-ho");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$/);
    expect(await verifyPassword("yo-ho-ho", a)).toBe(true);
    expect(await verifyPassword("yo-ho-hum", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("auth routes", () => {
  it("signs up, sets an httpOnly session cookie, and knows who you are", async () => {
    const { res, cookie } = await signUp(t.app);
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: "CaroS", email: "caros@example.test" });
    expect(res.json().user).not.toHaveProperty("passwordHash");
    const set = res.cookies.find((c) => c.name === "pc_session")!;
    expect(set.httpOnly).toBe(true);
    expect(set.sameSite).toBe("Lax");

    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user.username).toBe("CaroS");
  });

  it("rejects duplicate usernames regardless of case, and duplicate emails", async () => {
    await signUp(t.app, "CaroS");
    const dupName = await t.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { username: "caros", email: "other@example.test", password: "parrots-and-rum" },
    });
    expect(dupName.statusCode).toBe(409);
    expect(dupName.json().error).toMatch(/username/);
    const dupEmail = await t.app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: { username: "Another", email: "CAROS@example.test", password: "parrots-and-rum" },
    });
    expect(dupEmail.statusCode).toBe(409);
    expect(dupEmail.json().error).toMatch(/email/);
  });

  it.each([
    [{ username: "ab", email: "a@b.test", password: "longenough" }, /3–20/],
    [{ username: "bad name!", email: "a@b.test", password: "longenough" }, /3–20/],
    [{ username: "Fine", email: "nope", password: "longenough" }, /email/],
    [{ username: "Fine", email: "a@b.test", password: "short" }, /8 characters/],
  ])("validates signup %#", async (payload, message) => {
    const res = await t.app.inject({ method: "POST", url: "/api/auth/signup", payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(message);
  });

  it("logs in by username or email, case-insensitively", async () => {
    await signUp(t.app);
    for (const login of ["CaroS", "caros", "CAROS@example.test"]) {
      const res = await t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { login, password: "parrots-and-rum" },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it("gives the same error for a wrong password and an unknown user", async () => {
    await signUp(t.app);
    const wrong = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "CaroS", password: "nope-nope" },
    });
    const unknown = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "Ghost", password: "nope-nope" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrong.json());
  });

  it("logs out and the old cookie stops working", async () => {
    const { cookie } = await signUp(t.app);
    await t.app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user).toBeNull();
  });

  it("rate-limits repeated login attempts", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { login: "x", password: "y" },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});
