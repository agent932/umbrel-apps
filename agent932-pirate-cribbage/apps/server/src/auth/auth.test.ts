import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUp, testApp } from "../test/testApp.js";
import { setShopOpen } from "../test/shop.js";
import { credit } from "../economy/wallet.js";
import { hashPassword, verifyPassword } from "./password.js";
import { userColumns } from "./sessions.js";

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

  it("lets a player pick a crew portrait, or go back to their initial", async () => {
    const { cookie } = await signUp(t.app);
    const me = async () =>
      (await t.app.inject({ url: "/api/auth/me", headers: { cookie } })).json().user;
    expect((await me()).avatar).toBeNull();
    const pick = (avatar: unknown) =>
      t.app.inject({
        method: "POST",
        url: "/api/auth/avatar",
        headers: { cookie },
        payload: { avatar },
      });
    expect((await pick(3)).json().user.avatar).toBe(3);
    expect((await me()).avatar).toBe(3);
    expect((await pick(9)).statusCode).toBe(400);
    expect((await pick(null)).statusCode).toBe(200);
    expect((await me()).avatar).toBeNull();
    expect(
      (await t.app.inject({ method: "POST", url: "/api/auth/avatar", payload: { avatar: 1 } }))
        .statusCode,
    ).toBe(401);
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

  it("shows the player's doubloons after signing up, logging in, and on /me", async () => {
    const { res, cookie } = await signUp(t.app);
    expect(res.json().user.doubloons).toBe(0);
    await credit(t.db, res.json().user.id, 85, "daily", "2026-10-06");
    const login = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "CaroS", password: "parrots-and-rum" },
    });
    expect(login.json().user.doubloons).toBe(85);
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user.doubloons).toBe(85);
  });

  describe("the board and card back, and the shop switch", () => {
    const whoAmI = async (cookie?: string) =>
      (await t.app.inject({ url: "/api/auth/me", headers: cookie ? { cookie } : {} })).json();
    const logIn = () =>
      t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { login: "CaroS", password: "parrots-and-rum" },
      });

    it("gives the same user on signup, login and /me, using the defaults", async () => {
      const { res, cookie } = await signUp(t.app);
      const user = res.json().user;
      expect(user).toMatchObject({ equippedBoard: null, equippedDeck: null });
      // Login builds its user by hand, so check it has exactly the session columns.
      expect(Object.keys(user).sort()).toEqual(Object.keys(userColumns).sort());
      expect((await logIn()).json().user).toEqual(user);
      expect((await whoAmI(cookie)).user).toEqual(user);
    });

    it("shows the back a player chose after logging in and on /me", async () => {
      const { cookie } = await signUp(t.app);
      // Moon and Compass is free, so anyone may use it, shop open or not.
      const use = await t.app.inject({
        method: "POST",
        url: "/api/shop/use",
        headers: { cookie },
        payload: { itemId: "deck.moon-compass" },
      });
      expect(use.statusCode).toBe(200);
      const chosen = { equippedBoard: null, equippedDeck: "deck.moon-compass" };
      expect((await whoAmI(cookie)).user).toMatchObject(chosen);
      expect((await logIn()).json().user).toMatchObject(chosen);
    });

    it("says on /me whether the shop is open to players, for guests too", async () => {
      const captain = await signUp(t.app, "Captain");
      const bonny = await signUp(t.app, "Bonny");
      expect(bonny.res.json().user.isAdmin).toBe(false);
      expect(await whoAmI()).toEqual({ user: null, shopOpen: false });
      // It's the switch, not whether you can see the shop: an admin's preview doesn't open it.
      expect((await whoAmI(captain.cookie)).shopOpen).toBe(false);
      expect((await whoAmI(bonny.cookie)).shopOpen).toBe(false);

      await setShopOpen(t.db, true);
      expect(await whoAmI()).toEqual({ user: null, shopOpen: true });
      expect((await whoAmI(captain.cookie)).shopOpen).toBe(true);
      expect((await whoAmI(bonny.cookie)).shopOpen).toBe(true);

      await setShopOpen(t.db, false);
      expect(await whoAmI()).toEqual({ user: null, shopOpen: false });
      expect((await whoAmI(bonny.cookie)).shopOpen).toBe(false);
    });
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

  it("deletes your own account after checking your password, but never the last admin", async () => {
    const captain = await signUp(t.app, "Captain");
    const crew = await signUp(t.app, "Bonny");
    const del = (cookie: string, password: string) =>
      t.app.inject({
        method: "POST",
        url: "/api/auth/delete",
        headers: { cookie },
        payload: { password },
      });
    expect((await del(crew.cookie, "wrong-password")).statusCode).toBe(401);
    expect((await del(captain.cookie, "parrots-and-rum")).statusCode).toBe(409);
    expect((await del(crew.cookie, "parrots-and-rum")).statusCode).toBe(200);
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie: crew.cookie } });
    expect(me.json().user).toBeNull();
    const again = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { login: "Bonny", password: "parrots-and-rum" },
    });
    expect(again.statusCode).toBe(401);
    // The name is free again.
    expect((await signUp(t.app, "Bonny")).res.statusCode).toBe(201);
  });

  it("logs out and the old cookie stops working", async () => {
    const { cookie } = await signUp(t.app);
    await t.app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    const me = await t.app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.json().user).toBeNull();
  });

  it("rate-limits by the Cloudflare visitor address, which a faked X-Forwarded-For can't dodge", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const res = await t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": `198.51.100.${i}` },
        payload: { login: "x", password: "y" },
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    // A different visitor isn't affected.
    const other = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "cf-connecting-ip": "203.0.113.8" },
      payload: { login: "x", password: "y" },
    });
    expect(other.statusCode).toBe(401);
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
