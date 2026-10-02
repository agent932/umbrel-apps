import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Action,
  IllegalActionError,
  botAction,
  cryptoRandom,
  powerBlocker,
} from "@pirate/engine";
import { BOT, type LocalGame, YOU, dealAction, saveGame, step } from "./localGame.js";

/** How long the bot "thinks" before each move, so the player can follow along. */
export const BOT_DELAY_MS = 750;
/** Extra time to reach for Belay That! before the bot plays over your card. */
export const BELAY_WINDOW_MS = 2500;
const DEAL_DELAY_MS = 350;

export function useLocalGame(initial: LocalGame, botDelay = BOT_DELAY_MS) {
  const [game, setGame] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Latest state for `act`, so rapid clicks never apply an action to a stale game.
  const gameRef = useRef(game);
  useLayoutEffect(() => {
    gameRef.current = game;
  }, [game]);

  const act = useCallback((action: Action) => {
    try {
      const next = step(gameRef.current, action);
      gameRef.current = next;
      setGame(next);
      setError(null);
    } catch (e) {
      if (e instanceof IllegalActionError) setError(e.message);
      else throw e;
    }
  }, []);

  useEffect(() => saveGame(game), [game]);

  // The host deals automatically, and the bot takes its turns after a short pause.
  useEffect(() => {
    const { state, options } = game;
    if (state.phase === "deal") {
      const t = setTimeout(() => act(dealAction()), DEAL_DELAY_MS);
      return () => clearTimeout(t);
    }
    const move = botAction(state, BOT, options.level, cryptoRandom);
    if (!move) return;
    const canBelay = move.type === "play" && powerBlocker(state, YOU, "belay") === null;
    const t = setTimeout(
      () => act(move),
      canBelay && botDelay > 0 ? botDelay + BELAY_WINDOW_MS : botDelay,
    );
    return () => clearTimeout(t);
  }, [game, act, botDelay]);

  return { game, act, error, clearError: () => setError(null) };
}
