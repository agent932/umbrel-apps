export const SUITS = ["S", "H", "D", "C"] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const JACK = 11;

/** Counting value: face cards count 10, aces count 1. */
export function cardValue(card: Card): number {
  return Math.min(card.rank, 10);
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Compact label, e.g. "AS", "10H", "QD". Unique per card, so it doubles as an id. */
export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]}${card.suit}`;
}

/** Inverse of cardLabel. Also accepts "T" for ten and lowercase. */
export function parseCard(label: string): Card {
  const text = label.trim().toUpperCase();
  const suit = text.slice(-1) as Suit;
  const rankText = text.slice(0, -1) === "T" ? "10" : text.slice(0, -1);
  const rank = RANK_LABELS.indexOf(rankText);
  if (rank < 1 || !SUITS.includes(suit)) throw new Error(`Not a card: "${label}"`);
  return { rank: rank as Rank, suit };
}

/** Parse a space-separated list, e.g. "5H 5S JD". */
export function parseCards(labels: string): Card[] {
  return labels.trim().split(/\s+/).map(parseCard);
}

/** Return `cards` without the given cards. Throws if any is missing. */
export function removeCards(cards: readonly Card[], remove: readonly Card[]): Card[] {
  const rest = [...cards];
  for (const card of remove) {
    const i = rest.findIndex((c) => sameCard(c, card));
    if (i < 0) throw new Error(`Card ${cardLabel(card)} not held`);
    rest.splice(i, 1);
  }
  return rest;
}

/** Fisher–Yates shuffle. `random` returns a float in [0, 1); the server passes a crypto-backed one. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Small deterministic PRNG for tests and replays. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crypto-quality random float in [0, 1), for real games. */
export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 4294967296;
}
