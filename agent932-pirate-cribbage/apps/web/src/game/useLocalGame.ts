import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type Action,
  IllegalActionError,
  botAction,
  cryptoRandom,
  powerBlocker,
} from "@pirate/engine";
import {
  BOT,
  type LocalGame,
  YOU,
  houseAction,
  names,
  saveGame,
  step,
  toEngineAction,
} from "./localGame.js";
import type { GameController, UiAction } from "./types.js";

/**
 * How long the bot "thinks" before each move (at normal speed), so the player can follow along:
 * each card played, with its count and points, stays readable for at least this long.
 */
export const BOT_DELAY_MS = 1200;
/** Extra time to reach for Belay That! before the bot plays over your card. */
export const BELAY_WINDOW_MS = 2500;
const DEAL_DELAY_MS = 350;
/** How long the two cut cards stay up before the first deal. */
export const CUT_REVEAL_MS = 2200;

export function useLocalGame(initial: LocalGame, botDelay = BOT_DELAY_MS): GameController {
  const [game, setGame] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // Latest state for `apply`, so rapid clicks never apply an action to a stale game.
  const gameRef = useRef(game);
  useLayoutEffect(() => {
    gameRef.current = game;
  }, [game]);

  const apply = useCallback((action: Action) => {
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
    const house = houseAction(state);
    if (house) {
      // After the cut for deal, pause so both cards can be seen before the deal.
      const delay = house.type === "deal" && state.round === 0 ? CUT_REVEAL_MS : DEAL_DELAY_MS;
      const t = setTimeout(() => apply(house), botDelay > 0 ? delay : 0);
      return () => clearTimeout(t);
    }
    const move = botAction(state, BOT, options.level, cryptoRandom);
    if (!move) return;
    const canBelay = move.type === "play" && powerBlocker(state, YOU, "belay") === null;
    const delay = canBelay && botDelay > 0 ? botDelay + BELAY_WINDOW_MS : botDelay;
    const t = setTimeout(() => apply(move), delay);
    return () => clearTimeout(t);
  }, [game, apply, botDelay]);

  return {
    p: game.p,
    names: names(game.options.level),
    level: game.options.level,
    act: (a: UiAction) => apply(toEngineAction(gameRef.current.state, a)),
    error,
    ranked: false,
  };
}
