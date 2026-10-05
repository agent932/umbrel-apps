import { describe, expect, it } from "vitest";
import { CLASSIC_RULES, botAction } from "@pirate/engine";
import {
  BOT,
  YOU,
  dealAction,
  houseAction,
  loadGame,
  newLocalGame,
  saveGame,
  step,
} from "./localGame.js";

describe("local game", () => {
  it("starts with both players cutting for the deal", () => {
    const game = newLocalGame({ level: "medium", rules: CLASSIC_RULES });
    expect(game.state.phase).toBe("cutForDeal");
    expect(game.p.view.cutForDeal?.deckSize).toBe(52);
  });

  it("plays a whole game, tracking back pegs and the feed", () => {
    let game = newLocalGame({ level: "medium", rules: CLASSIC_RULES });
    for (let i = 0; i < 5000 && game.state.phase !== "gameOver"; i++) {
      const { state } = game;
      const before = state.scores;
      const action =
        houseAction(state) ??
        (state.phase === "roundEnd"
          ? ({ type: "nextRound" } as const)
          : (botAction(state, YOU, "medium") ?? botAction(state, BOT, "medium"))!);
      game = step(game, action);
      // After the show, a back peg sits where its peg was before its last count.
      const reveal = game.p.lastEvents.some((e) => e.type === "hand") ? game.p.reveal! : [];
      if (reveal.length) expect(reveal.at(-1)!.scores).toEqual(game.state.scores);
      for (const seat of [YOU, BOT]) {
        if (reveal.length) expect(game.p.backPegs[seat]).toBe(reveal.at(-1)!.backPegs[seat]);
        else if (game.state.scores[seat] !== before[seat])
          expect(game.p.backPegs[seat]).toBe(before[seat]);
      }
    }
    expect(game.state.phase).toBe("gameOver");
    expect(game.p.feed[0]!.text).toMatch(/won/);
    expect(game.p.feed.length).toBeLessThanOrEqual(40);
  });

  it("collects the show for the round summary and clears it on the next deal", () => {
    let game = newLocalGame({ level: "easy", rules: CLASSIC_RULES });
    while (game.state.phase !== "roundEnd" && game.state.phase !== "gameOver") {
      const s = game.state;
      game = step(
        game,
        houseAction(s) ?? (botAction(s, YOU, "easy") ?? botAction(s, BOT, "easy"))!,
      );
    }
    if (game.state.phase === "roundEnd") {
      expect(game.p.show.map((e: { type: string }) => e.type)).toEqual(["hand", "hand", "crib"]);
      game = step(step(game, { type: "nextRound" }), dealAction());
      expect(game.p.show).toEqual([]);
    }
  });

  it("saves and resumes, and forgets finished games", () => {
    const game = newLocalGame({ level: "easy", rules: CLASSIC_RULES });
    saveGame(game);
    expect(loadGame()).toEqual(game);
    saveGame({ ...game, state: { ...game.state, phase: "gameOver" } });
    expect(loadGame()).toBeNull();
  });
});
