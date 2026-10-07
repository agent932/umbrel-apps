import { type Card, createDeck, seededRandom, shuffle } from "./cards.js";

/**
 * The daily discard for a day ("2026-10-04"): six cards, and whether you deal. Every signed-in
 * player gets the same hand that day, and the server pays doubloons for it. Guests (`guest`) get a
 * different hand of their own, so the answer a guest is shown can't be carried into a paid throw.
 */
export function dailyDeal(day: string, guest = false): { hand: Card[]; isDealer: boolean } {
  let seed = 2166136261;
  for (const ch of guest ? `guest:${day}` : day) {
    seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  const random = seededRandom(seed);
  const hand = shuffle(createDeck(), random).slice(0, 6);
  return { hand: hand.sort((a, b) => a.rank - b.rank), isDealer: random() < 0.5 };
}
