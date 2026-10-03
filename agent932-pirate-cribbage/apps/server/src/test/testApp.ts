import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { buildApp } from "../app.js";
import type { Timing } from "../online/rooms.js";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";

/** A fresh in-memory Postgres (PGlite) with migrations applied, and the app on top of it. */
export async function testApp(
  migrationsFolder = process.env.SERVER_MIGRATIONS ??
    fileURLToPath(new URL("../../drizzle", import.meta.url)),
  timing?: Timing,
  messageLimit = 100_000,
) {
  const client = new PGlite();
  const pg = drizzle(client, { schema });
  await migrate(pg, { migrationsFolder });
  const db = pg as unknown as Db;
  // Test clients play whole games at machine speed, far past any human, so the flood limit is
  // raised unless a test asks for the real one.
  const build = () =>
    buildApp({
      db,
      checkDb: async () => true,
      logger: false,
      timing,
      socketMessageLimit: messageLimit,
    });
  const app = await build();
  return {
    app,
    db,
    /** A second app on the same database, as after a server restart. */
    restart: build,
    close: async () => (await app.close(), await client.close()),
  };
}

/** Sign up and return a cookie header for later requests. */
export async function signUp(app: Awaited<ReturnType<typeof testApp>>["app"], username = "CaroS") {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/signup",
    payload: {
      username,
      email: `${username.toLowerCase()}@example.test`,
      password: "parrots-and-rum",
    },
  });
  const cookie = res.cookies.find((c) => c.name === "pc_session")!;
  return { res, cookie: `pc_session=${cookie.value}` };
}
