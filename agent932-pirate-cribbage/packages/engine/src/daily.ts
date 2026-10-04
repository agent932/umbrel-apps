import { type Card, createDeck, seededRandom, shuffle } from "./cards.js";

/** The same six cards for everyone on a given day ("2026-10-04"), and whether you deal. */
export function dailyDeal(day: string): { hand: Card[]; isDealer: boolean } {
  let seed = 2166136261;
  for (const ch of day) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const random = seededRandom(seed);
  const hand = shuffle(createDeck(), random).slice(0, 6);
  return { hand: hand.sort((a, b) => a.rank - b.rank), isDealer: random() < 0.5 };
}
