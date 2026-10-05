import { type GameEvent, type PlayerView, type Seat, describeEvent } from "@pirate/engine";
import type { FeedItem, Presentation, RevealStage, ShowEvent } from "./types.js";

function eventPoints(e: GameEvent): number {
  switch (e.type) {
    case "played":
    case "hand":
    case "crib":
      return e.score.total;
    case "go":
    case "lastCard":
    case "heels":
    case "treasure":
    case "kraken":
      return e.points;
    case "power":
      return -e.cost;
    default:
      return 0;
  }
}

export function initialPresentation(view: PlayerView): Presentation {
  return {
    view,
    feed: [],
    show: [],
    backPegs: [view.scores[0], view.scores[1]],
    nextId: 1,
    lastEvents: [],
    reveal: [],
  };
}

const isShow = (e: GameEvent): e is ShowEvent => e.type === "hand" || e.type === "crib";

/**
 * Splits a step that ends in the show into stages: the pegging that ended the round, then each
 * hand or crib with whatever it caused (treasure, the Kraken, the win). Works out where both pegs
 * stand after each stage, so the board can move them one count at a time. Empty when the step has
 * no show, or when the events don't add up to the new scores (then the board just jumps).
 */
export function revealStages(
  events: GameEvent[],
  before: { scores: [number, number]; backPegs: [number, number] },
  view: PlayerView,
  names: readonly [string, string],
): RevealStage[] {
  if (!events.some(isShow)) return [];
  const groups: GameEvent[][] = [[]];
  for (const e of events) {
    if (isShow(e)) groups.push([]);
    groups.at(-1)!.push(e);
  }
  const target = view.rules.targetScore;
  const scores: [number, number] = [...before.scores];
  const backPegs: [number, number] = [...before.backPegs];
  const stages = groups.map((group): RevealStage => {
    const start: [number, number] = [...scores];
    for (const e of group) {
      if ("seat" in e) scores[e.seat] = Math.min(scores[e.seat] + eventPoints(e), target);
    }
    for (const seat of [0, 1] as Seat[])
      if (scores[seat] !== start[seat]) backPegs[seat] = start[seat];
    return {
      scores: [...scores],
      backPegs: [...backPegs],
      events: group,
      feed: group.filter((e) => describeEvent(e, names)).length,
    };
  });
  return scores[0] === view.scores[0] && scores[1] === view.scores[1] ? stages : [];
}

/** Fold one step (the events of an action and the view after it) into what's on screen. */
export function present(
  prev: Presentation,
  events: GameEvent[],
  view: PlayerView,
  names: readonly [string, string],
): Presentation {
  const backPegs: [number, number] = [...prev.backPegs];
  for (const seat of [0, 1] as Seat[]) {
    if (view.scores[seat] !== prev.view.scores[seat]) backPegs[seat] = prev.view.scores[seat];
  }
  let nextId = prev.nextId;
  const fresh: FeedItem[] = [];
  for (const e of events) {
    const text = describeEvent(e, names);
    if (!text) continue;
    const seat = "seat" in e ? e.seat : e.type === "gameOver" ? e.winner : null;
    fresh.unshift({ id: nextId++, text, seat, points: eventPoints(e) });
  }
  const dealt = events.some((e) => e.type === "dealt");
  const shown = events.filter(isShow);
  const reveal = shown.length
    ? revealStages(events, { scores: prev.view.scores, backPegs: prev.backPegs }, view, names)
    : dealt
      ? []
      : (prev.reveal ?? []);
  // After the show, each back peg sits where that peg was before its last count, not before the round's last play.
  if (shown.length && reveal.length) backPegs.splice(0, 2, ...reveal.at(-1)!.backPegs);
  return {
    view,
    backPegs,
    reveal,
    nextId,
    lastEvents: events,
    feed: [...fresh, ...prev.feed].slice(0, 40),
    show: dealt ? [] : [...prev.show, ...shown],
  };
}
