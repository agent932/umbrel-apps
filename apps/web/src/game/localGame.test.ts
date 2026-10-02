import { describe, expect, it } from "vitest";
import { CLASSIC_RULES, botAction } from "@pirate/engine";
import { BOT, YOU, dealAction, loadGame, newLocalGame, saveGame, step } from "./localGame.js";

describe("local game", () => {
  it("plays a whole game, tracking back pegs and the feed", () => {
    let game = newLocalGame({ level: "medium", rules: CLASSIC_RULES });
    for (let i = 0; i < 5000 && game.state.phase !== "gameOver"; i++) {
      const { state } = game;
      const before = state.scores;
      const action =
        state.phase === "deal"
          ? dealAction()
          : state.phase === "roundEnd"
            ? ({ type: "nextRound" } as const)
            : (botAction(state, YOU, "medium") ?? botAction(state, BOT, "medium"))!;
      game = step(game, action);
      for (const seat of [YOU, BOT]) {
        if (game.state.scores[seat] !== before[seat])
          expect(game.backPegs[seat]).toBe(before[seat]);
      }
    }
    expect(game.state.phase).toBe("gameOver");
    expect(game.feed[0]!.text).toMatch(/won/);
    expect(game.feed.length).toBeLessThanOrEqual(40);
  });

  it("collects the show for the round summary and clears it on the next deal", () => {
    let game = newLocalGame({ level: "easy", rules: CLASSIC_RULES });
    while (game.state.phase !== "roundEnd" && game.state.phase !== "gameOver") {
      const s = game.state;
      game = step(
        game,
        s.phase === "deal"
          ? dealAction()
          : (botAction(s, YOU, "easy") ?? botAction(s, BOT, "easy"))!,
      );
    }
    if (game.state.phase === "roundEnd") {
      expect(game.show.map((e) => e.type)).toEqual(["hand", "hand", "crib"]);
      game = step(step(game, { type: "nextRound" }), dealAction());
      expect(game.show).toEqual([]);
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
