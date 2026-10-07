import type {
  BotLevel,
  Cosmetics,
  GameEvent,
  PlayerStats,
  PlayerView,
  Reward,
} from "@pirate/engine";
import { API_ORIGIN, appToken, isNativeApp, setAppToken } from "./native.js";

export type { DoubloonLine, Reward } from "@pirate/engine";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The server's short name for the error, when it gives one (the shop's "short", "owned"…). */
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> =
    init.body === undefined ? {} : { "content-type": "application/json" };
  if (isNativeApp) {
    headers["x-deckhand-client"] = "app";
    const token = appToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(API_ORIGIN + path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: isNativeApp ? "omit" : "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    token?: string;
  };
  if (!res.ok)
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  // The app keeps its session token itself (signing in returns it; signing out forgets it).
  if (isNativeApp) {
    if (data.token) setAppToken(data.token);
    if (path === "/api/auth/logout" || path === "/api/auth/delete") setAppToken(null);
  }
  return data as T;
}

export interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  rankedGames: number;
  /** Painted crew portrait 1-8, or null for their initial. */
  avatar: number | null;
  isAdmin: boolean;
  /** Doubloons on hand. Optional so older servers still fit; read it as `?? 0`. */
  doubloons?: number;
  /** The board and card back they use (item ids); null or missing means the default. */
  equippedBoard?: string | null;
  equippedDeck?: string | null;
}

/** Something the shop sells, or a free board or back. */
export interface ShopItem {
  /** Also the skin's key: "board.treasure-map". */
  id: string;
  /** "board" or "deck" (a card back). A newer server may send a type this build doesn't know. */
  type: string;
  name: string;
  description: string;
  /** In doubloons; 0 = free, owned by everyone. */
  price: number;
  isDefault: boolean;
  /** False once taken off sale: it shows only to the players who own it. */
  available: boolean;
}

/** GET /api/shop. */
export interface ShopResponse {
  open: boolean;
  /** The shop is closed and you're an admin: you see it as players will. */
  preview?: true;
  /** Shop visible to you: every item on sale, plus any taken off sale that you own. Closed and
   *  signed in: only what you own. Closed, guest: empty. */
  items: ShopItem[];
  /** Signed in, with the shop visible to you. */
  doubloons?: number;
  /** Signed in only: item ids you own (the free items too), open or not. */
  owned?: string[];
  equipped?: Cosmetics;
}

export interface Season {
  id: number;
  name: string;
  startedAt: string;
  endedAt: string | null;
}

export interface Friend {
  id: string;
  username: string;
  rating: number;
  tier: string;
  online: boolean;
}

export interface FriendsResponse {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

export interface Step {
  events: GameEvent[];
  view: PlayerView;
}

export interface GameResponse {
  gameId: string;
  level: BotLevel;
  steps: Step[];
  /** Your doubloons for the game, on the response that finishes it. */
  reward?: Reward;
}

export interface StatsResponse {
  variant: "all" | "classic" | "pirate";
  buckets: { key: string; label: string; stats: PlayerStats }[];
}
