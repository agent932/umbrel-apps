import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PIRATE_RULES, type GameState } from "@pirate/engine";
import { users } from "../db/schema.js";
import { recordMatch } from "../games/record.js";
import { playGame } from "../test/games.js";
import { signUp, testApp } from "../test/testApp.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

async function userId(name: string) {
  const { cookie } = await signUp(t.app, name);
  const [u] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, name));
  return { id: u!.id, cookie };
}

/** Record a bot game that started `minutes` ago (10: long enough to count for wins). */
const record = (state: GameState, players: [string | null, string | null], minutes = 10) =>
  recordMatch(
    t.db,
    {
      id: crypto.randomUUID(),
      mode: "ai",
      aiLevel: "easy",
      createdAt: new Date(Date.now() - minutes * 60_000),
    },
    players,
    state,
  );

const earned = async (cookie: string) =>
  (await t.app.inject({ url: "/api/achievements", headers: { cookie } }))
    .json()
    .achievements.map((a: { key: string }) => a.key);

describe("achievements", () => {
  it("gives the winner First Plunder once, and the loser nothing for losing", async () => {
    const anne = await userId("Anne");
    const bonny = await userId("Bonny");
    const state = playGame();
    const winner = state.winner === 0 ? anne : bonny;
    const loser = state.winner === 0 ? bonny : anne;
    await record(state, [anne.id, bonny.id]);
    await record(state, [anne.id, bonny.id]);
    expect((await earned(winner.cookie)).filter((k: string) => k === "firstWin")).toHaveLength(1);
    expect(await earned(loser.cookie)).not.toContain("firstWin");
  }, 30_000);

  it("keeps First Plunder for a win that counts, not a game over in a minute", async () => {
    const anne = await userId("Anne");
    const state = playGame();
    const seats = (state.winner === 0 ? [anne.id, null] : [null, anne.id]) as [
      string | null,
      string | null,
    ];
    await record(state, seats, 1);
    expect(await earned(anne.cookie)).not.toContain("firstWin");
    await record(state, seats);
    expect(await earned(anne.cookie)).toContain("firstWin");
  }, 30_000);

  it("spots a 29 hand and the pirate powers a player used", async () => {
    const anne = await userId("Anne");
    const state = playGame(PIRATE_RULES);
    state.history[0]!.seats[0].handPoints = 29;
    state.powersUsed[0] = ["spyglass"];
    await record(state, [anne.id, null]);
    const keys = await earned(anne.cookie);
    expect(keys).toEqual(expect.arrayContaining(["hand24", "hand29", "power:spyglass"]));
  }, 30_000);

  it("needs you signed in", async () => {
    expect((await t.app.inject({ url: "/api/achievements" })).statusCode).toBe(401);
  });
});
