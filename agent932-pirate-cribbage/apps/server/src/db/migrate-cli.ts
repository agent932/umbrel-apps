// `npm run db:migrate` — applies migrations from apps/server/drizzle.
import { config } from "../config.js";
import { connect } from "./client.js";
import { defaultMigrationsFolder, runMigrations } from "./migrate.js";

const { db, close } = connect(config.databaseUrl);
await runMigrations(db, defaultMigrationsFolder);
await close();
console.log("Migrations applied");
