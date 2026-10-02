import path from "node:path";
import { buildApp } from "./app.js";
import { config } from "./config.js";
import { connect } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

const { db, close, ping } = connect(config.databaseUrl);

if (config.migrateOnStart) {
  // In the Docker image the migrations folder sits next to dist/.
  await runMigrations(db, path.resolve(import.meta.dirname, "../drizzle"));
}

const app = await buildApp({ db, checkDb: ping, webDist: config.webDist });
await app.listen({ port: config.port, host: config.host });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    await close();
    process.exit(0);
  });
}
