import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";

export async function runMigrations(migrationsFolder: string) {
  await migrate(db, { migrationsFolder });
}
