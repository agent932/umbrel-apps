import type { BotLevel, GameEvent, PlayerStats, PlayerView } from "@pirate/engine";

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
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Step {
  events: GameEvent[];
  view: PlayerView;
}

export interface GameResponse {
  gameId: string;
  level: BotLevel;
  steps: Step[];
}

export interface StatsResponse {
  variant: "all" | "classic" | "pirate";
  buckets: { key: string; label: string; stats: PlayerStats }[];
}
