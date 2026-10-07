/**
 * The site the browser tests run against: the production web build served by the real server,
 * on a fresh in-memory Postgres (PGlite) that disappears when the run ends.
 */
import { fileURLToPath } from "node:url";
import { testApp } from "../apps/server/src/test/testApp.js";
import { PORT } from "./players.js";

const webDist = fileURLToPath(new URL("../apps/web/dist", import.meta.url));
// Online timers long enough that a slow test machine never has a move made for it.
const timing = { turnMs: 600_000, nextRoundMs: 600_000, disconnectMs: 600_000 };
const { app } = await testApp(undefined, timing, undefined, webDist);
await app.listen({ port: PORT, host: "localhost" });
console.log(`e2e server on http://localhost:${PORT}`);
