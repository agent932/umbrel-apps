import { POWERS, POWER_INFO, type PowerId } from "./game.js";

export interface Achievement {
  key: string;
  name: string;
  description: string;
}

/** Everything a player can earn, in the order the Ship's Log shows them. */
export const ACHIEVEMENTS: Achievement[] = [
  { key: "firstWin", name: "First Plunder", description: "Win your first game." },
  { key: "hand24", name: "Treasure Trove", description: "Score 24 or more in one hand or crib." },
  {
    key: "hand29",
    name: "The Perfect Hand",
    description: "Score a 29, the best hand in cribbage.",
  },
  { key: "skunk", name: "Skunked 'Em", description: "Win by 31 points or more." },
  { key: "doubleSkunk", name: "Double Skunk", description: "Win by 61 points or more." },
  { key: "wins10", name: "Seasoned Sailor", description: "Win 10 games." },
  { key: "streak5", name: "Fair Winds", description: "Win 5 games in a row." },
  { key: "gold", name: "Gold Captain", description: "Reach Gold rank or better in ranked play." },
  ...POWERS.map((p) => ({
    key: powerAchievement(p),
    name: `${POWER_INFO[p].name} Master`,
    description: `Use ${POWER_INFO[p].name} in a game.`,
  })),
];

export function powerAchievement(power: PowerId) {
  return `power:${power}`;
}
