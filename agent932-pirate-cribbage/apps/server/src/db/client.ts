import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema.js";

/** Works with both postgres-js (production) and PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function connect(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, close: () => client.end(), ping: async () => (await client`select 1`, true) };
}
