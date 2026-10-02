import { describe, expect, it } from "vitest";
import {
  type Action,
  type BotLevel,
  type GameState,
  PIRATE_RULES,
  type RuleSet,
  applyAction,
  botAction,
  createDeck,
  createGame,
  describeEvent,
  discardOptions,
  parseCards,
  seededRandom,
  shuffle,
} from "./index.js";

/** Host loop: deals and advances rounds, bots do everything else. */
function playOut(levels: [BotLevel, BotLevel], seed: number, rules?: RuleSet) {
  const random = seededRandom(seed);
  let state: GameState = createGame(0, rules);
  const lines: string[] = [];
  for (let i = 0; i < 10_000 && state.phase !== "gameOver"; i++) {
    let action: Action | null;
    if (state.phase === "deal") action = { type: "deal", deck: shuffle(createDeck(), random) };
    else if (state.phase === "roundEnd") action = { type: "nextRound" };
    else action = botAction(state, 0, levels[0], random) ?? botAction(state, 1, levels[1], random);
    if (!action) throw new Error(`Nobody can act in ${state.phase}`);
    const result = applyAction(state, action);
    state = result.state;
    for (const e of result.events) {
      const line = describeEvent(e, ["You", "Bot"]);
      if (line) lines.push(line);
    }
  }
  return { state, lines };
}

describe("botAction", () => {
  it("plays complete classic and pirate games at every level", () => {
    for (const rules of [undefined, PIRATE_RULES]) {
      for (const levels of [
        ["easy", "easy"],
        ["medium", "easy"],
        ["medium", "medium"],
      ] as const) {
        const { state } = playOut([...levels], 3, rules);
        expect(state.phase).toBe("gameOver");
      }
    }
  });

  it("medium beats easy most of the time", () => {
    let wins = 0;
    for (let seed = 1; seed <= 60; seed++) {
      if (playOut(["medium", "easy"], seed).state.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThan(40);
  });

  it("returns null when it's not the bot's turn", () => {
    const state = createGame(0);
    expect(botAction(state, 0, "medium")).toBeNull();
  });
});

describe("describeEvent", () => {
  it("describes a whole game in plain English", () => {
    const { lines } = playOut(["medium", "medium"], 9);
    expect(lines.some((l) => l.startsWith("The cut is"))).toBe(true);
    expect(lines.some((l) => /hand: /.test(l))).toBe(true);
    expect(lines.at(-1)).toMatch(/won/);
  });
});

describe("discardOptions", () => {
  it("ranks keeping four fives as the best discard", () => {
    const [best] = discardOptions(parseCards("5H 5D 5C 5S KH 2C"));
    expect(best!.keep.map((c) => c.rank)).toEqual([5, 5, 5, 5]);
  });
});
