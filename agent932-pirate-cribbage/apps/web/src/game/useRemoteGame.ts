import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ApiError, type GameResponse, type Reward, type Step, api } from "../api.js";
import { names as botNames } from "./localGame.js";
import { initialPresentation, present } from "./present.js";
import { BELAY_WINDOW_MS, BOT_DELAY_MS } from "./useLocalGame.js";
import type { GameController, UiAction } from "./types.js";
import { RESET_HOLD_MS } from "../components/table/tableHooks.js";

/**
 * A game vs the computer run by the server (so it counts toward stats). The server answers each
 * move with every step that followed; they're replayed one at a time so the bot's moves can be followed.
 */
export function useRemoteGame(initial: GameResponse, botDelay = BOT_DELAY_MS): GameController {
  const label = botNames(initial.level);
  const [p, setP] = useState(() =>
    initial.steps.reduce(
      (acc, s) => present(acc, s.events, s.view, label),
      initialPresentation(initial.steps[0]!.view),
    ),
  );
  const [queue, setQueue] = useState<Step[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Your doubloons, from the response that finished the game.
  const [reward, setReward] = useState<Reward | null>(null);
  // Ignore clicks while a move is in flight or the bot's moves are still playing out.
  const busy = useRef(false);
  useLayoutEffect(() => {
    busy.current = sending || queue.length > 0;
  }, [sending, queue]);

  const send = useCallback(
    async (action: UiAction | { type: "continue" }) => {
      if (busy.current) return;
      busy.current = true;
      setSending(true);
      try {
        const res = await api<GameResponse>(`/api/games/${initial.gameId}/actions`, {
          body: action,
        });
        // Your own move shows at once; what follows (the bot, the deal) plays out with pauses.
        const [mine, ...rest] = res.steps;
        if (mine) setP((prev) => present(prev, mine.events, mine.view, label));
        setQueue(rest);
        // Safe to keep while the last steps still play out: it shows only once the game is over.
        if (res.reward) setReward(res.reward);
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Lost contact with the ship. Try again.");
      } finally {
        setSending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial.gameId],
  );

  // Play queued steps one by one.
  useEffect(() => {
    const [next, ...rest] = queue;
    if (!next) return;
    const quick = next.events.some((e) => e.type === "dealt");
    // After a run ends (31 or a Go), let its last card be seen before the bot leads again.
    const afterReset = p.lastEvents.some((e) => e.type === "reset");
    const wait = quick
      ? Math.min(botDelay, 350)
      : afterReset
        ? Math.max(botDelay, Math.round(RESET_HOLD_MS * (botDelay / BOT_DELAY_MS)))
        : botDelay;
    const t = setTimeout(() => {
      setP((prev) => present(prev, next.events, next.view, label));
      setQueue(rest);
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, botDelay]);

  // The server pauses before the bot plays over your card, in case you want to Belay That!
  const v = p.view;
  const pausedForBelay =
    !sending && queue.length === 0 && v.phase === "pegging" && v.toAct.includes(1);
  useEffect(() => {
    if (!pausedForBelay) return;
    const t = setTimeout(() => void send({ type: "continue" }), botDelay > 0 ? BELAY_WINDOW_MS : 0);
    return () => clearTimeout(t);
  }, [pausedForBelay, send, botDelay, p]);

  return {
    p,
    names: label,
    level: initial.level,
    act: (a) => void send(a),
    error,
    ranked: true,
    reward,
  };
}
