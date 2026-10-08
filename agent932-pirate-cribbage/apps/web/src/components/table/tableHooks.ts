import { useCallback, useEffect, useState } from "react";
import type { Card as CardType, GameEvent, Seat } from "@pirate/engine";
import type { Presentation, RevealStage } from "../../game/types.js";
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

/** How long the last cards of a round stay on the table before the hands are counted (normal speed). */
export const LAST_PLAY_MS = 3500;

export type PilePlay = { card: CardType; seat: Seat };
type Table = { pile: PilePlay[]; count: number };

/**
 * A hold on the table, worked out while each step of the game is drawn rather than in an effect
 * just after it, so the step's very first frame has it. (The step that ends a round also brings on
 * the counting: one frame without the hold flashed the counting up and took the pile away, and its
 * cards flew in again a moment later.) `look` gets what was kept from the step before, the table to
 * start from and the hold, and says what to keep now. The timer belongs to the hold itself, so new
 * events can't cancel it and leave the cards stuck.
 */
function useStepHold(
  pegging: boolean,
  events: GameEvent[],
  look: (kept: { table: Table; held: Table | null }) => { table: Table; held: Table | null },
  start: Table,
  holdMs: number,
) {
  const [kept, setKept] = useState({ pegging, events, table: start, held: null as Table | null });
  let now = kept;
  // Only when the game moves on, not for every re-render of the same step.
  if (pegging !== kept.pegging || events !== kept.events) {
    now = { ...look(kept), pegging, events };
    setKept(now);
  }
  const held = now.held;
  useEffect(() => {
    if (!held) return;
    const t = setTimeout(
      () => setKept((k) => (k.held === held ? { ...k, held: null } : k)),
      holdMs,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);
  return held;
}

/**
 * The cards and count from the end of pegging, held for a few seconds after the round moves on
 * (the engine goes straight to counting hands, so the last card would otherwise vanish at once).
 * The hold runs its full time even if more news arrives meanwhile (an online resync, a call-out).
 */
export function useLastPlay(
  livePile: PilePlay[],
  count: number,
  pegging: boolean,
  events: GameEvent[],
  instant: boolean,
  holdMs = LAST_PLAY_MS,
) {
  const look = (kept: { table: Table; held: Table | null }) => {
    // Play has started again (a new round), so nothing from the last one is held.
    if (pegging) return { table: { pile: livePile, count }, held: null };
    if (instant || !events.some((e) => e.type === "played")) return kept;
    // Start from the table as it was, then add the plays that ended the round.
    let pile = [...kept.table.pile];
    let shown = kept.table.count;
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
    return { table: kept.table, held: { pile, count: shown } };
  };
  return useStepHold(pegging, events, look, { pile: livePile, count }, holdMs);
}

/** How long a finished run of play (31, or a Go) stays on the table before the pile clears (normal speed). */
export const RESET_HOLD_MS = 2500;

/**
 * The cards and count of a run of play that just ended on 31 or a Go. The engine clears the pile in
 * the same step as the card that ended it (often the opponent's), so without this that card would
 * never be seen. Held until its time is up or the next card starts a new pile.
 */
export function useResetHold(
  livePile: PilePlay[],
  count: number,
  pegging: boolean,
  events: GameEvent[],
  instant: boolean,
  holdMs = RESET_HOLD_MS,
) {
  const look = (kept: { table: Table; held: Table | null }) => {
    // The next step starts from the table as this one leaves it.
    const table = { pile: livePile, count };
    if (!pegging || instant) return { table, held: null };
    let pile = [...kept.table.pile];
    let shown = kept.table.count;
    let finished: Table | null = null;
    for (const e of events) {
      if (e.type === "played") {
        pile.push({ card: e.card, seat: e.seat });
        shown = e.count;
      }
      if (e.type === "reset") {
        finished = { pile, count: shown };
        pile = [];
        shown = 0;
      }
    }
    // Only while the new pile is still empty (a card led in the same step shows instead).
    return {
      table,
      held: finished && pile.length === 0 && finished.pile.length > 0 ? finished : null,
    };
  };
  const held = useStepHold(pegging, events, look, { pile: livePile, count }, holdMs);
  // The next card played starts the new pile, so the old one goes.
  return held && livePile.length === 0 ? held : null;
}

const NO_STAGES: RevealStage[] = [];

/**
 * The table during the show: scores, pegs, sounds and log lines catch up one count at a time, so a
 * peg moves only once its hand (or crib) has been counted out. `reveal(n)` is called by the
 * counting panel when the first n hands have been shown. Pegging points peg straight away.
 */
export function useShowReveal(p: Presentation, instant: boolean) {
  const stages = p.reveal ?? NO_STAGES;
  const [state, setState] = useState({ stages, n: 0, events: stages[0]?.events ?? [] });
  // A new show starts at its pegging stage.
  const at = state.stages === stages ? state : { stages, n: 0, events: stages[0]?.events ?? [] };
  const counting = at.stages.length > 0 && !instant && at.n < stages.length - 1;
  const stage = counting ? stages[at.n]! : null;
  const hiddenFeed = stage ? stages.slice(at.n + 1).reduce((t, s) => t + s.feed, 0) : 0;
  const reveal = useCallback(
    (n: number) =>
      setState((prev) => {
        const base =
          prev.stages === stages ? prev : { stages, n: 0, events: stages[0]?.events ?? [] };
        const from = base.n;
        if (n <= from) return base;
        // Everything counted since last time (several hands at once after Skip).
        const events = stages.slice(from + 1, n + 1).flatMap((s) => s.events);
        return { stages, n, events };
      }),
    [stages],
  );
  return {
    scores: stage?.scores ?? p.view.scores,
    backPegs: stage?.backPegs ?? p.backPegs,
    /** The events to play sounds and scenes for: the latest step, or the latest counts. */
    events: stages.length && !instant ? at.events : p.lastEvents,
    feed: p.feed.slice(hiddenFeed),
    reveal,
  };
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
