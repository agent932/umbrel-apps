import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  CLASSIC_RULES,
  PIRATE_RULES,
  type GameState,
  type RuleSet,
  applyAction,
  botAction,
  createDeck,
  hostAction,
  newGame,
  shuffle,
} from "@pirate/engine";
import { users } from "../db/schema.js";
import { recordMatch } from "../games/record.js";
import { signUp, testApp } from "../test/testApp.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => (t = await testApp()));
afterEach(async () => t.close());

/** A whole game between two bots. */
function playGame(rules: RuleSet = CLASSIC_RULES): GameState {
  let s = newGame(rules);
  for (let i = 0; i < 10_000 && s.phase !== "gameOver"; i++) {
    const action =
      s.phase === "roundEnd"
        ? { type: "nextRound" as const }
        : (hostAction(s, () => shuffle(createDeck())) ??
          botAction(s, 0, "medium") ??
          botAction(s, 1, "medium"));
    if (!action) throw new Error(`Nobody can act in ${s.phase}`);
    s = applyAction(s, action).state;
  }
  return s;
}

async function userId(name: string) {
  const { cookie } = await signUp(t.app, name);
  const [u] = await t.db.select({ id: users.id }).from(users).where(eq(users.username, name));
  return { id: u!.id, cookie };
}

const record = (state: GameState, players: [string | null, string | null]) =>
  recordMatch(
    t.db,
    { id: crypto.randomUUID(), mode: "ai", aiLevel: "easy", createdAt: new Date() },
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
