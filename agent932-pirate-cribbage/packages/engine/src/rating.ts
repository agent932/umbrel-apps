/** Elo ratings and the tiers shown in the game. Everyone starts at 1000 (Bronze). */

export const START_RATING = 1000;
/** How far one game can move a rating. */
export const K_FACTOR = 32;

export const TIERS = [
  { key: "bronze", name: "Bronze", min: -Infinity },
  { key: "silver", name: "Silver", min: 1100 },
  { key: "gold", name: "Gold", min: 1250 },
  { key: "platinum", name: "Platinum", min: 1400 },
  { key: "diamond", name: "Diamond", min: 1550 },
] as const;
export type Tier = (typeof TIERS)[number]["key"];

export function tierFor(rating: number): (typeof TIERS)[number] {
  return [...TIERS].reverse().find((t) => rating >= t.min)!;
}

/** Chance that a player rated `a` beats one rated `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** New ratings after one game. Points move from loser to winner; the upset bonus is built in. */
export function rateGame(
  winner: number,
  loser: number,
  k = K_FACTOR,
): { winner: number; loser: number } {
  const delta = Math.round(k * (1 - expectedScore(winner, loser)));
  return { winner: winner + delta, loser: loser - delta };
}
