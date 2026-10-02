import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Db } from "./client.js";

export const defaultMigrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db, migrationsFolder: string) {
  await migrate(db as unknown as PostgresJsDatabase, { migrationsFolder });
}
