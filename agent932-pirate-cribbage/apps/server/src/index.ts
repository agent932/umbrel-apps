import path from "node:path";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { sql } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

if (config.migrateOnStart) {
  // In the Docker image the migrations folder sits next to dist/.
  await runMigrations(path.resolve(import.meta.dirname, "../drizzle"));
}

const app = await buildApp({
  checkDb: async () => {
    await sql`select 1`;
    return true;
  },
  webDist: config.webDist,
});

await app.listen({ port: config.port, host: config.host });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await sql.end();
    process.exit(0);
  });
}
