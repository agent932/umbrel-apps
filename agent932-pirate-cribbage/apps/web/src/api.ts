import type { BotLevel, GameEvent, PlayerStats, PlayerView, Reward } from "@pirate/engine";
import { API_ORIGIN, appToken, isNativeApp, setAppToken } from "./native.js";

export type { DoubloonLine, Reward } from "@pirate/engine";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
  const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
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
