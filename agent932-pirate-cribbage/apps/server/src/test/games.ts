import {
  CLASSIC_RULES,
  type GameState,
  type RuleSet,
  applyAction,
  botAction,
  createDeck,
  hostAction,
  newGame,
  seededRandom,
  shuffle,
} from "@pirate/engine";

/**
 * Two bots play from a new game until `stop` says so or the game ends. The same seed always
 * plays the same game.
 */
export function playUntil(
  rules: RuleSet,
  seed: number,
  stop: (s: GameState) => boolean,
): GameState {
  const random = seededRandom(seed);
  let s = newGame(rules);
  for (let i = 0; i < 10_000 && s.phase !== "gameOver" && !stop(s); i++) {
    const action =
      s.phase === "roundEnd"
        ? { type: "nextRound" as const }
        : (hostAction(s, () => shuffle(createDeck(), random)) ??
          botAction(s, 0, "medium", random) ??
          botAction(s, 1, "medium", random));
    if (!action) throw new Error(`Nobody can act in ${s.phase}`);
    s = applyAction(s, action).state;
  }
  return s;
}

/** A whole game between two bots. */
export function playGame(rules: RuleSet = CLASSIC_RULES, seed = 1): GameState {
  return playUntil(rules, seed, () => false);
}

/** A game with `rounds` rounds complete and the next one just dealt (for forfeits). */
export function playRounds(rounds: number, seed = 1, rules: RuleSet = CLASSIC_RULES): GameState {
  const s = playUntil(
    rules,
    seed,
    (s) => s.phase === "discard" && s.history.filter((r) => r.complete).length === rounds,
  );
  if (s.phase !== "discard") throw new Error(`The game ended before ${rounds} rounds`);
  return s;
}
