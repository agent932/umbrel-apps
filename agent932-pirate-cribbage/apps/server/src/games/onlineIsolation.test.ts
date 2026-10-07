import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { games } from "../db/schema.js";
import { testApp } from "../test/testApp.js";
import { LONG, matchedPair } from "../test/wsClient.js";

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

async function login(username: string) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { login: username, password: "parrots-and-rum" },
  });
  return `pc_session=${res.cookies.find((c) => c.name === "pc_session")!.value}`;
}

describe("games vs the computer never touch online games", () => {
  it("can't play, resume, abandon or end an online game through the computer-game routes", async () => {
    t = await testApp(undefined, LONG);
    const { gameId } = await matchedPair(t, { variant: "classic" });
    for (const name of ["Anne", "Bonny"]) {
      const cookie = await login(name);
      const act = await t.app.inject({
        method: "POST",
        url: `/api/games/${gameId}/actions`,
        headers: { cookie },
        payload: { type: "cut" },
      });
      expect(act.statusCode).toBe(404);
      const active = await t.app.inject({ url: "/api/games/active", headers: { cookie } });
      expect(JSON.stringify(active.json())).not.toContain(gameId);
      await t.app.inject({
        method: "POST",
        url: `/api/games/${gameId}/abandon`,
        headers: { cookie },
      });
      // Starting a game against the crew used to close every unfinished game of yours.
      const started = await t.app.inject({
        method: "POST",
        url: "/api/games",
        headers: { cookie },
        payload: { level: "easy", variant: "classic" },
      });
      expect(started.statusCode).toBeLessThan(300);
    }
    const [row] = await t.db.select().from(games).where(eq(games.id, gameId));
    expect(row?.mode).toBe("online");
    expect(row?.finishedAt).toBeNull();
  });
});
