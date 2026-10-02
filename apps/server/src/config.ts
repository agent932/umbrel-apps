import path from "node:path";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://pirate:pirate@localhost:5432/pirate_cribbage",
  /** Directory of the built web app; served by the API server in production. */
  webDist: process.env.WEB_DIST && path.resolve(process.env.WEB_DIST),
  migrateOnStart: process.env.MIGRATE_ON_START === "true",
};
