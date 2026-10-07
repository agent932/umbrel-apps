import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { CLASSIC_RULES, SHOP_ITEMS } from "@pirate/engine";
import { playGame, playUntil } from "../test/games.js";
import { expectLedgerMatches } from "../test/ledger.js";
import type { Db } from "./client.js";
import { defaultMigrationsFolder } from "./migrate.js";
import * as schema from "./schema.js";

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}
const folder = defaultMigrationsFolder;
const readJournal = (dir: string): Journal =>
  JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as Journal;

/** A temporary copy of the migrations as they were before `tag`: it and every later one removed. */
function migrationsBefore(tag: string): string {
  const journal = readJournal(folder);
  const at = journal.entries.find((e) => e.tag === tag);
  if (!at) throw new Error(`No migration ${tag}`);
  const dir = mkdtempSync(join(tmpdir(), "pc-migrations-"));
  cpSync(folder, dir, { recursive: true });
  for (const e of journal.entries.filter((e) => e.idx >= at.idx)) {
    rmSync(join(dir, `${e.tag}.sql`));
  }
  journal.entries = journal.entries.filter((e) => e.idx < at.idx);
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  return dir;
}

/** The constraint a statement broke, or null if it ran. */
async function broken(statement: Promise<unknown>): Promise<string | null> {
  try {
    await statement;
    return null;
  } catch (err) {
    // Drizzle wraps the database's error; the original names the constraint.
    const cause = (err as Error).cause as { constraint?: string } | undefined;
    return cause?.constraint ?? String(err);
  }
}

describe("migrations", () => {
  it("lists every migration once, in order, each dated after the last", () => {
    // The migrator only applies migrations dated after the newest one a database already has,
    // so a migration dated earlier would silently never run on existing servers.
    const { entries } = readJournal(folder);
    entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(e.tag.startsWith(`${String(i).padStart(4, "0")}_`), e.tag).toBe(true);
      expect(existsSync(join(folder, `${e.tag}.sql`)), e.tag).toBe(true);
      if (i > 0) expect(e.when, e.tag).toBeGreaterThan(entries[i - 1]!.when);
    });
    const files = readdirSync(folder).filter((f) => f.endsWith(".sql"));
    expect(files.sort()).toEqual(entries.map((e) => `${e.tag}.sql`).sort());
  });

  it("upgrades a database from before doubloons without losing anything", async () => {
    const before = migrationsBefore("0012_wallet");
    const client = new PGlite();
    try {
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: before });
      await db.execute(sql`
        insert into users (username, email, password_hash)
        values ('Anne', 'anne@example.test', 'x'), ('Bonny', 'bonny@example.test', 'x')`);
      await db.execute(
        sql`insert into achievements (user_id, key) select id, 'firstWin' from users`,
      );

      await migrate(db, { migrationsFolder: folder });
      const players = await db.select({ doubloons: schema.users.doubloons }).from(schema.users);
      expect(players.map((p) => p.doubloons)).toEqual([0, 0]);
      expect(await db.select().from(schema.achievements)).toHaveLength(2);
      expect(await db.select().from(schema.walletLedger)).toEqual([]);
      const checks = await db.execute<{ conname: string }>(
        sql`select conname from pg_constraint where contype = 'c' order by conname`,
      );
      expect(checks.rows.map((r) => r.conname)).toEqual(
        expect.arrayContaining(["users_doubloons_nonneg", "wallet_ledger_delta_nonzero"]),
      );
      await expect(db.execute(sql`update users set doubloons = -1`)).rejects.toThrow();
      // Deleting a player clears actor_id on the ledger; an index saves reading the whole ledger.
      const indexes = await db.execute<{ indexdef: string }>(
        sql`select indexdef from pg_indexes where indexname = 'wallet_ledger_actor'`,
      );
      expect(indexes.rows[0]?.indexdef).toMatch(/\(actor_id\) WHERE \(actor_id IS NOT NULL\)/);
      const applied = await db.execute(sql`select * from drizzle.__drizzle_migrations`);
      expect(applied.rows).toHaveLength(readJournal(folder).entries.length);
    } finally {
      await client.close();
      rmSync(before, { recursive: true, force: true });
    }
  });

  it("upgrades a populated database to the shop", async () => {
    const before = migrationsBefore("0013_shop");
    const client = new PGlite();
    try {
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: before });
      // Two players with doubloons (each balance the sum of its ledger), an achievement, an
      // unfinished online game and a finished game against the computer.
      await db.execute(sql`
        insert into users (username, email, password_hash, doubloons)
        values ('Anne', 'anne@example.test', 'x', 30), ('Bonny', 'bonny@example.test', 'x', 25)`);
      await db.execute(sql`
        insert into wallet_ledger (user_id, delta, reason, ref_id)
        select id, 35, 'botWin', 'match-1' from users where username = 'Anne'
        union all select id, -5, 'admin', 'request-1' from users where username = 'Anne'
        union all select id, 25, 'daily', '2026-10-06' from users where username = 'Bonny'`);
      await db.execute(
        sql`insert into achievements (user_id, key) select id, 'firstWin' from users`,
      );
      const midGame = playUntil(CLASSIC_RULES, 1, (s) => s.phase === "pegging");
      const finished = playGame();
      await db.execute(sql`
        insert into games (user_id, user2_id, mode, ranked, state)
        select a.id, b.id, 'online', true, ${JSON.stringify(midGame)}::jsonb
        from users a, users b where a.username = 'Anne' and b.username = 'Bonny'`);
      await db.execute(sql`
        insert into games (user_id, mode, ai_level, state, finished_at)
        select id, 'ai', 'hard', ${JSON.stringify(finished)}::jsonb, now()
        from users where username = 'Bonny'`);

      await migrate(db, { migrationsFolder: folder });
      const applied = await db.execute(sql`select * from drizzle.__drizzle_migrations`);
      expect(applied.rows).toHaveLength(readJournal(folder).entries.length);

      // The seed is the engine's catalog, every item available.
      const items = await db.select().from(schema.shopItems);
      const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
      const seeded = items.map(({ id, type, name, description, price, isDefault, sort }) => {
        return { id, type, name, description, price, isDefault, sort };
      });
      expect(seeded.sort(byId)).toEqual([...SHOP_ITEMS].sort(byId));
      expect(items.every((i) => i.available)).toBe(true);

      // Nothing that was there changes: everyone uses the defaults and owns only the free items.
      const players = await db
        .select({
          username: schema.users.username,
          doubloons: schema.users.doubloons,
          equippedBoard: schema.users.equippedBoard,
          equippedDeck: schema.users.equippedDeck,
        })
        .from(schema.users)
        .orderBy(schema.users.username);
      expect(players).toEqual([
        { username: "Anne", doubloons: 30, equippedBoard: null, equippedDeck: null },
        { username: "Bonny", doubloons: 25, equippedBoard: null, equippedDeck: null },
      ]);
      expect(await db.select().from(schema.walletLedger)).toHaveLength(3);
      await expectLedgerMatches(db as unknown as Db);
      expect(await db.select().from(schema.achievements)).toHaveLength(2);
      expect(await db.select().from(schema.inventory)).toEqual([]);
      const games = await db
        .select({
          mode: schema.games.mode,
          cosmetics: schema.games.cosmetics,
          state: schema.games.state,
        })
        .from(schema.games)
        .orderBy(schema.games.mode);
      expect(games).toEqual([
        { mode: "ai", cosmetics: null, state: finished },
        { mode: "online", cosmetics: null, state: midGame },
      ]);

      const checks = await db.execute<{ conname: string }>(
        sql`select conname from pg_constraint where contype = 'c' order by conname`,
      );
      expect(checks.rows.map((r) => r.conname)).toEqual(
        expect.arrayContaining([
          "shop_items_type",
          "shop_items_id_format",
          "shop_items_price",
          "users_equipped_board_type",
          "users_equipped_deck_type",
          "wallet_ledger_purchase_negative",
        ]),
      );

      // Each check turns away a bad row, and only that.
      const addItem = (id: string, type: string, price: number, isDefault = false) =>
        db.execute(sql`
          insert into shop_items (id, type, name, price, is_default)
          values (${id}, ${type}, 'Test item', ${price}, ${isDefault})`);
      expect(await broken(addItem("pegs.gold", "pegs", 500))).toBe("shop_items_type");
      expect(await broken(addItem("deck.x", "board", 1500))).toBe("shop_items_id_format");
      expect(await broken(addItem("board.", "board", 1500))).toBe("shop_items_id_format");
      expect(await broken(addItem("board.Foo", "board", 1500))).toBe("shop_items_id_format");
      expect(await broken(addItem("board.gilded", "board", 5, true))).toBe("shop_items_price");
      expect(await broken(addItem("board.gilded", "board", -1))).toBe("shop_items_price");
      expect(await broken(addItem("board.driftwood", "board", 0))).toBeNull();
      expect(await broken(addItem("board.gilded", "board", 0, true))).toBe(
        "shop_items_one_default",
      );

      const equip = (column: "equipped_board" | "equipped_deck", id: string) =>
        db.execute(sql`update users set ${sql.identifier(column)} = ${id} where username = 'Anne'`);
      expect(await broken(equip("equipped_board", "deck.crimson"))).toBe(
        "users_equipped_board_type",
      );
      expect(await broken(equip("equipped_deck", "board.treasure-map"))).toBe(
        "users_equipped_deck_type",
      );
      expect(await broken(equip("equipped_board", "board.nope"))).toBe(
        "users_equipped_board_shop_items_id_fk",
      );

      const purchase = (delta: number) =>
        db.execute(sql`
          insert into wallet_ledger (user_id, delta, reason, ref_id)
          select id, ${delta}, 'purchase', 'deck.crimson' from users where username = 'Bonny'`);
      expect(await broken(purchase(10))).toBe("wallet_ledger_purchase_negative");
      expect(await broken(purchase(-10))).toBeNull();
      await db.execute(sql`update users set doubloons = 15 where username = 'Bonny'`);
      await expectLedgerMatches(db as unknown as Db);

      // A seeded item that someone uses or owns can't be deleted.
      expect(await broken(equip("equipped_board", "board.treasure-map"))).toBeNull();
      expect(
        await broken(db.execute(sql`delete from shop_items where id = 'board.treasure-map'`)),
      ).toBe("users_equipped_board_shop_items_id_fk");
      await db.execute(sql`
        insert into inventory (user_id, item_id)
        select id, 'deck.crimson' from users where username = 'Bonny'`);
      expect(await broken(db.execute(sql`delete from shop_items where id = 'deck.crimson'`))).toBe(
        "inventory_item_id_shop_items_id_fk",
      );
      // Inventory goes with the account.
      await db.execute(sql`delete from users where username = 'Bonny'`);
      expect(await db.select().from(schema.inventory)).toEqual([]);
    } finally {
      await client.close();
      rmSync(before, { recursive: true, force: true });
    }
  });
});
