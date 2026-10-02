import { cardLabel, type Card } from "./cards.js";
import { type GameEvent, POWER_INFO, type Seat } from "./game.js";
import type { HandScore } from "./handScore.js";
import type { PegScore } from "./pegScore.js";

const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;

/** Display label with a suit symbol, e.g. "10♥". */
export function cardText(card: Card): string {
  return cardLabel(card).slice(0, -1) + SUIT_SYMBOLS[card.suit];
}

export function pegScoreParts(score: PegScore): string[] {
  const parts: string[] = [];
  if (score.fifteen) parts.push("fifteen for 2");
  if (score.thirtyOne) parts.push("thirty-one for 2");
  if (score.pairs === 2) parts.push("a pair for 2");
  if (score.pairs === 6) parts.push("three of a kind for 6");
  if (score.pairs === 12) parts.push("four of a kind for 12");
  if (score.run) parts.push(`a run of ${score.run} for ${score.run}`);
  return parts;
}

export function handScoreParts(score: HandScore): string[] {
  const { points } = score;
  const parts: string[] = [];
  if (points.fifteens)
    parts.push(
      `${score.fifteens.length === 1 ? "fifteen" : `${score.fifteens.length} fifteens`} for ${points.fifteens}`,
    );
  if (points.pairs)
    parts.push(
      `${score.pairs.length === 1 ? "a pair" : `${score.pairs.length} pairs`} for ${points.pairs}`,
    );
  if (points.runs) {
    const len = score.runs[0]!.length;
    parts.push(
      `${score.runs.length === 1 ? `a run of ${len}` : `${score.runs.length} runs of ${len}`} for ${points.runs}`,
    );
  }
  if (points.flush) parts.push(`a flush for ${points.flush}`);
  if (points.nobs) parts.push("nobs for 1");
  return parts;
}

/**
 * One line of plain English for an event, or null for events not worth announcing.
 * `names` gives each seat's display name.
 */
export function describeEvent(event: GameEvent, names: readonly [string, string]): string | null {
  const who = (seat: Seat) => names[seat];
  const whose = (seat: Seat) => (names[seat] === "You" ? "Your" : `${names[seat]}'s`);
  switch (event.type) {
    case "cut":
      return `The cut is ${cardText(event.card)}`;
    case "heels":
      return `${who(event.seat)}: his heels for 2`;
    case "played": {
      const parts = pegScoreParts(event.score);
      return `${who(event.seat)} played ${cardText(event.card)} (${event.count})${parts.length ? ` — ${parts.join(", ")}` : ""}`;
    }
    case "go":
      return `${who(event.seat)}: go for 1`;
    case "lastCard":
      return `${who(event.seat)}: last card for 1`;
    case "hand":
    case "crib": {
      const parts = handScoreParts(event.score);
      const label = event.type === "crib" ? "crib" : "hand";
      return `${whose(event.seat)} ${label}: ${event.score.total === 0 ? "nineteen (zero)" : `${event.score.total} — ${parts.join(", ")}`}`;
    }
    case "treasure":
      return `${who(event.seat)} dug up buried treasure on hole ${event.hole}! +${event.points}`;
    case "kraken":
      return `The Kraken drags ${who(event.seat)} back from hole ${event.hole}! ${event.points}`;
    case "blackSpot":
      return `The Black Spot! ${who(event.seat)} steals the crib this round`;
    case "power":
      return `${who(event.seat)} used ${POWER_INFO[event.power].name}${event.cost ? ` (−${event.cost})` : ""}`;
    case "belayed":
      return `${who(event.seat)} took back ${cardText(event.card)}`;
    case "gameOver":
      return `${who(event.winner)} won${event.skunk === 2 ? " with a double skunk" : event.skunk === 1 ? " with a skunk" : ""}!`;
    default:
      return null;
  }
}
