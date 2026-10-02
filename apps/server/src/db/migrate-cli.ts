// `npm run db:migrate` — applies migrations from apps/server/drizzle.
import { fileURLToPath } from "node:url";
import { sql } from "./client.js";
import { runMigrations } from "./migrate.js";

await runMigrations(fileURLToPath(new URL("../../drizzle", import.meta.url)));
await sql.end();
console.log("Migrations applied");
