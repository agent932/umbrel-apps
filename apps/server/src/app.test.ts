import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /api/health", () => {
  it("reports ok when the database is up", async () => {
    const app = await buildApp({ checkDb: async () => true, logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: "up", deckSize: 52 });
  });

  it("reports degraded when the database is down", async () => {
    const app = await buildApp({ checkDb: async () => false, logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: "down" });
  });
});
