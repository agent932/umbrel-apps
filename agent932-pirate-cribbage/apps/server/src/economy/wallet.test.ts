import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, walletLedger } from "../db/schema.js";
import { doubloonsOf, expectLedgerMatches, ledgerRows } from "../test/ledger.js";
import { signUp, testApp } from "../test/testApp.js";
import { OverdrawError, balanceOf, credit, lockWallets } from "./wallet.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => {
  try {
    await expectLedgerMatches(t.db);
  } finally {
    await t.close();
  }
});

async function user(name: string) {
  const { cookie } = await signUp(t.app, name);
  const [u] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, name));
  return { id: u!.id, cookie };
}

/** The error text (including the database's) a promise fails with, or "" if it succeeds. */
async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    return `${String(e)} ${String((e as { cause?: unknown }).cause)}`;
  }
}

describe("the wallet", () => {
  it("pays each event once", async () => {
    const { id } = await user("Anne");
    expect(await credit(t.db, id, 25, "daily", "2026-10-06")).toEqual({ paid: true, balance: 25 });
    expect(await credit(t.db, id, 25, "daily", "2026-10-06")).toEqual({ paid: false, balance: 25 });
    expect(await ledgerRows(t.db, id)).toHaveLength(1);
    expect(await balanceOf(t.db, id)).toBe(25);
  });

  it("tells events apart by player, reason and reference", async () => {
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    const match = crypto.randomUUID();
    expect((await credit(t.db, anne.id, 50, "onlineWin", match)).paid).toBe(true);
    expect((await credit(t.db, anne.id, 10, "skunk", match)).paid).toBe(true);
    expect((await credit(t.db, bonny.id, 50, "onlineWin", match)).paid).toBe(true);
    expect(await doubloonsOf(t.db, anne.id)).toBe(60);
    expect(await doubloonsOf(t.db, bonny.id)).toBe(50);
  });

  it("never goes below zero, and undoes its own row when it refuses", async () => {
    const { id } = await user("Anne");
    await credit(t.db, id, 100, "daily", "2026-10-05");
    await expect(
      t.db.transaction((tx) => credit(tx, id, -101, "admin", crypto.randomUUID())),
    ).rejects.toBeInstanceOf(OverdrawError);
    expect(await ledgerRows(t.db, id)).toHaveLength(1);
    expect(await doubloonsOf(t.db, id)).toBe(100);

    // Inside a bigger transaction that carries on, the refused change leaves nothing behind.
    await t.db.transaction(async (tx) => {
      await credit(tx, id, 20, "daily", "2026-10-06");
      await expect(credit(tx, id, -500, "admin", crypto.randomUUID())).rejects.toBeInstanceOf(
        OverdrawError,
      );
    });
    expect((await ledgerRows(t.db, id)).map((r) => r.delta)).toEqual([100, 20]);
    expect(await doubloonsOf(t.db, id)).toBe(120);
  });

  it("only takes whole, non-zero amounts, and the database agrees", async () => {
    const { id } = await user("Anne");
    for (const delta of [0, 1.5, NaN]) {
      await expect(credit(t.db, id, delta, "admin", crypto.randomUUID())).rejects.toThrow(
        /bad delta/,
      );
    }
    expect(
      await failure(
        t.db.insert(walletLedger).values({ userId: id, delta: 0, reason: "admin", refId: "x" }),
      ),
    ).toMatch(/wallet_ledger_delta_nonzero/);
    expect(
      await failure(t.db.update(users).set({ doubloons: -1 }).where(eq(users.id, id))),
    ).toMatch(/users_doubloons_nonneg/);
  });

  it("pays once when five transactions credit the same event together (one at a time on PGlite)", async () => {
    const { id } = await user("Anne");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        t.db.transaction(async (tx) => {
          await lockWallets(tx, [id]);
          return credit(tx, id, 25, "daily", "2026-10-06");
        }),
      ),
    );
    expect(results.filter((r) => r.paid)).toHaveLength(1);
    expect(await ledgerRows(t.db, id)).toHaveLength(1);
    expect(await doubloonsOf(t.db, id)).toBe(25);
  });

  it("locks wallets in id order, skipping the computer and repeats", async () => {
    const anne = await user("Anne");
    const bonny = await user("Bonny");
    const locked = await t.db.transaction((tx) =>
      lockWallets(tx, [bonny.id, null, anne.id, bonny.id]),
    );
    expect(locked.map((w) => w.id)).toEqual([anne.id, bonny.id].sort());
    expect(locked[0]).toMatchObject({ doubloons: 0 });
    expect(await lockWallets(t.db, [null, null])).toEqual([]);
  });

  it("goes with the account when a player deletes it", async () => {
    await user("Captain");
    const anne = await user("Anne");
    await credit(t.db, anne.id, 35, "botWin", crypto.randomUUID());
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/delete",
      headers: { cookie: anne.cookie },
      payload: { password: "parrots-and-rum" },
    });
    expect(res.statusCode).toBe(200);
    expect(await ledgerRows(t.db, anne.id)).toEqual([]);
  });
});

describe("the ledger is append-only", () => {
  const src = fileURLToPath(new URL("..", import.meta.url));
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => !f.startsWith(`test${sep}`))
    .map((f) => ({ path: relative(src, join(src, f)).split(sep).join("/"), text: "" }));
  for (const f of files) f.text = readFileSync(join(src, f.path), "utf8");
  const where = (pattern: RegExp) => files.filter((f) => pattern.test(f.text)).map((f) => f.path);

  it("is written only by economy/wallet.ts, and never changed or deleted", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(where(/insert\(walletLedger\)/)).toEqual(["economy/wallet.ts"]);
    expect(where(/(update|delete)\(walletLedger\)/)).toEqual([]);
  });

  it("has balances set only by economy/wallet.ts, and no raw SQL around it", () => {
    expect(where(/\.(set|values)\(\s*\{[^}]*\bdoubloons\b/)).toEqual(["economy/wallet.ts"]);
    expect(where(/set\s+"?doubloons"?\s*=/i)).toEqual([]);
    // Raw SQL would have to name the table, or splice it in whole.
    expect(where(/wallet_ledger/)).toEqual(["db/schema.ts"]);
    expect(where(/\$\{walletLedger\}/)).toEqual([]);
  });

  // A purchase's ledger row is keyed by the item, so each item is charged once, ever. That is
  // only fair while a bought item can't be taken away.
  it("has inventory rows added only by economy/shop.ts, after a wallet lock, and never changed or deleted", () => {
    expect(where(/insert\(inventory\)/)).toEqual(["economy/shop.ts"]);
    expect(where(/(update|delete)\(inventory\)/)).toEqual([]);
    expect(where(/(insert\s+into|update|delete\s+from)\s+"?inventory\b/i)).toEqual([]);
    // Each insert is inside a transaction that locked the wallet first.
    const shop = files.find((f) => f.path === "economy/shop.ts")!.text;
    const inserts = [...shop.matchAll(/insert\(inventory\)/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const m of inserts) {
      const before = shop.slice(0, m.index);
      const tx = before.lastIndexOf(".transaction(");
      expect(tx).toBeGreaterThan(-1);
      expect(before.slice(tx)).toMatch(/lockWallets\(tx, \[[\w.]+\]\)/);
    }
  });

  it("is checked by these patterns (they catch a direct write)", () => {
    const bad = "await db.update(users).set({ doubloons: sql`0` }); db.delete(walletLedger);";
    expect(/\.(set|values)\(\s*\{[^}]*\bdoubloons\b/.test(bad)).toBe(true);
    expect(/(update|delete)\(walletLedger\)/.test(bad)).toBe(true);
    const careless = 'await tx.delete(inventory); await db.execute(sql`delete from "inventory"`);';
    expect(/(update|delete)\(inventory\)/.test(careless)).toBe(true);
    expect(/(insert\s+into|update|delete\s+from)\s+"?inventory\b/i.test(careless)).toBe(true);
  });
});
