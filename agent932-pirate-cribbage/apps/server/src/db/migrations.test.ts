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
import { defaultMigrationsFolder } from "./migrate.js";
import * as schema from "./schema.js";

interface Journal {
  entries: { idx: number; when: number; tag: string }[];
}
const folder = defaultMigrationsFolder;
const readJournal = (dir: string): Journal =>
  JSON.parse(readFileSync(join(dir, "meta", "_journal.json"), "utf8")) as Journal;

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
    // A copy of the migrations as they were before 0012_wallet.
    const before = mkdtempSync(join(tmpdir(), "pc-migrations-"));
    const client = new PGlite();
    try {
      cpSync(folder, before, { recursive: true });
      const journal = readJournal(before);
      const wallet = journal.entries.find((e) => e.tag === "0012_wallet")!;
      expect(wallet).toBeDefined();
      journal.entries = journal.entries.filter((e) => e.idx < wallet.idx);
      writeFileSync(join(before, "meta", "_journal.json"), JSON.stringify(journal));
      rmSync(join(before, "0012_wallet.sql"));

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
      const applied = await db.execute(sql`select * from drizzle.__drizzle_migrations`);
      expect(applied.rows).toHaveLength(readJournal(folder).entries.length);
    } finally {
      await client.close();
      rmSync(before, { recursive: true, force: true });
    }
  });
});
