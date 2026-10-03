import { type GameEvent, type PlayerView, type Seat, describeEvent } from "@pirate/engine";
import type { FeedItem, Presentation, ShowEvent } from "./types.js";

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
  };
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
  const shown = events.filter((e): e is ShowEvent => e.type === "hand" || e.type === "crib");
  return {
    view,
    backPegs,
    nextId,
    lastEvents: events,
    feed: [...fresh, ...prev.feed].slice(0, 40),
    show: dealt ? [] : [...prev.show, ...shown],
  };
}
