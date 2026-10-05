import { useEffect, useRef, useState } from "react";
import type { Card as CardType, GameEvent, Seat } from "@pirate/engine";
import type { Emote } from "../../online/protocol.js";

/** True when the screen (and so the table, which fills it) is wider than tall: the board then
 * stands upright down the side. Matches the table's own landscape/portrait CSS. */
export function useUpright() {
  const query = () =>
    typeof window === "undefined" || !window.matchMedia?.("(orientation: portrait)").matches;
  const [upright, setUpright] = useState(query);
  useEffect(() => {
    const mq = window.matchMedia?.("(orientation: portrait)");
    if (!mq) return;
    const update = () => setUpright(!mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return upright;
}

/** How long the last cards of a round stay on the table before the hands are counted. */
const LAST_PLAY_MS = 3500;

export type PilePlay = { card: CardType; seat: Seat };

/**
 * The cards and count from the end of pegging, held for a few seconds after the round moves on
 * (the engine goes straight to counting hands, so the last card would otherwise vanish at once).
 */
export function useLastPlay(
  livePile: PilePlay[],
  count: number,
  pegging: boolean,
  events: GameEvent[],
  instant: boolean,
) {
  const last = useRef<{ pile: PilePlay[]; count: number }>({ pile: [], count: 0 });
  const [held, setHeld] = useState<{ pile: PilePlay[]; count: number } | null>(null);
  useEffect(() => {
    if (pegging) {
      last.current = { pile: livePile, count };
      return;
    }
    if (instant || !events.some((e) => e.type === "played")) return;
    // Start from the table as it was, then add the plays that ended the round.
    let pile = [...last.current.pile];
    let shown = last.current.count;
    let reset = false;
    for (const e of events) {
      if (e.type === "reset") reset = true;
      if (e.type === "played") {
        if (reset) pile = [];
        reset = false;
        pile.push({ card: e.card, seat: e.seat });
        shown = e.count;
      }
    }
    setHeld({ pile, count: shown });
    const t = setTimeout(() => setHeld(null), LAST_PLAY_MS);
    return () => clearTimeout(t);
    // Re-run only when the game moves on, not for every re-render of the same step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegging, events]);
  return held;
}

/** The latest call-out, for a couple of seconds. */
export function useCallout(emote: { seat: Seat; emote: Emote; key: number } | null) {
  const [shown, setShown] = useState(emote);
  useEffect(() => {
    if (!emote) return;
    // Shown from an effect because it reacts to a message arriving.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(emote);
    const t = setTimeout(() => setShown((s) => (s?.key === emote.key ? null : s)), 2600);
    return () => clearTimeout(t);
  }, [emote]);
  return shown;
}
