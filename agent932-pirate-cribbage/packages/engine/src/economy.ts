/**
 * Doubloons: what each win, skunk, daily puzzle and achievement pays, and the fair-play rules.
 * Pure (no I/O): the server decides every payout with it, and the web uses it to explain them.
 */
import type { BotLevel } from "./bot.js";
import type { GameState } from "./game.js";

/** Why a player's doubloons changed. Each (player, reason, ref) pays at most once. */
export type LedgerReason =
  | "botWin"
  | "onlineWin"
  | "rankedWin"
  | "skunk"
  | "firstWinOfDay"
  | "daily"
  | "achievement"
  | "admin";

/** Why a win paid nothing, or only half. */
export type WinNote =
  "short" | "earlyForfeit" | "lateForfeit" | "botCap" | "onlineCap" | "sameOpponent";

export interface DoubloonLine {
  reason: LedgerReason;
  delta: number;
  /** achievement: its key; skunk: "double" for a double skunk; daily: "best" for the best throw. */
  key?: string;
}

/** What one player earned from one finished game or daily puzzle. */
export interface Reward {
  /** Lines actually paid, in order: win, skunk, first win of the day, achievements (or daily, achievements). */
  lines: DoubloonLine[];
  /** Sum of the lines. */
  total: number;
  /** The player's doubloons after this. */
  balance: number;
  /** For the winner: why the win paid nothing or half. Null for losers and full-pay wins. */
  note: WinNote | null;
}

export const BOT_WIN: Record<BotLevel, number> = { easy: 20, medium: 35, hard: 50 };
export const ONLINE_WIN = 50;
export const RANKED_WIN = 60;
export const SKUNK_BONUS = 10;
/** Replaces the skunk bonus (they don't add up). */
export const DOUBLE_SKUNK_BONUS = 25;
export const FIRST_WIN_OF_DAY = 50;
export const DAILY_PLAYED = 10;
/** Replaces the daily played amount (25 in all). */
export const DAILY_BEST = 25;
/** Paying wins vs the computer per UTC day. */
export const BOT_WIN_CAP = 10;
/** Paying online and ranked wins per UTC day, against everyone. */
export const ONLINE_WIN_CAP = 10;
/** Paying online and ranked wins per UTC day against one opponent. */
export const SAME_OPPONENT_CAP = 3;
/** A game pays only when it lasted at least this many rounds... */
export const MIN_ROUNDS = 4;
/** ...and this long. */
export const MIN_GAME_MS = 180_000;
/** Games to a lower target (61) are short games and pay half. */
export const FULL_TARGET = 121;
/** The most an admin can add or remove at once. */
export const ADMIN_MAX_DELTA = 100_000;

/** Doubloons for each achievement, paid once when it unlocks. Together they make 1,500. */
export const ACHIEVEMENT_REWARD: Record<string, number> = {
  firstWin: 50,
  hand24: 100,
  hand29: 200,
  skunk: 100,
  doubleSkunk: 150,
  wins10: 100,
  streak5: 150,
  gold: 200,
  sharpEye: 150,
  "power:spyglass": 50,
  "power:crowsNest": 50,
  "power:parley": 50,
  "power:pickpocket": 50,
  "power:rebury": 50,
  "power:belay": 50,
};

/** Achievements earned by winning. They pay only when the game that unlocked them was long enough. */
export const WIN_ACHIEVEMENTS: ReadonlySet<string> = new Set([
  "firstWin",
  "wins10",
  "streak5",
  "skunk",
  "doubleSkunk",
]);

/** Doubloons for an achievement; 0 for an unknown key. */
export function achievementReward(key: string): number {
  return Object.hasOwn(ACHIEVEMENT_REWARD, key) ? ACHIEVEMENT_REWARD[key]! : 0;
}

/**
 * What an achievement pays when a game unlocks it. Win-based ones pay nothing when the game was
 * too short or an early forfeit; the rest pay whatever the game was like.
 */
export function achievementPayout(key: string, longEnoughGame: boolean): number {
  return WIN_ACHIEVEMENTS.has(key) && !longEnoughGame ? 0 : achievementReward(key);
}

/**
 * Rounds a game lasted. A finished game counts the round it was won in; a forfeited one counts
 * only the rounds that were completed (the abandoned round doesn't count).
 */
export function roundsPlayed(state: Pick<GameState, "history">, forfeited: boolean): number {
  return forfeited ? state.history.filter((r) => r.complete).length : state.history.length;
}

/** Whether a game lasted long enough to pay: at least 4 rounds and 3 minutes. */
export function longEnough(
  state: Pick<GameState, "history">,
  forfeited: boolean,
  durationMs: number,
): boolean {
  return roundsPlayed(state, forfeited) >= MIN_ROUNDS && durationMs >= MIN_GAME_MS;
}

export type MatchKind = "bot" | "online" | "ranked";

export interface WinInput {
  kind: MatchKind;
  /** The computer's level (bot games only). */
  level: BotLevel | null;
  state: Pick<GameState, "rules" | "skunk" | "history">;
  /** The loser forfeited. */
  forfeited: boolean;
  durationMs: number;
  /** Paid bot wins today, before this game. */
  paidBotWinsToday: number;
  /** Paid online and ranked wins today against anyone, before this game. */
  paidOnlineWinsToday: number;
  /** Paid online and ranked wins today against this opponent, before this game. */
  paidWinsVsOpponentToday: number;
}

export interface WinPayout {
  reason: "botWin" | "onlineWin" | "rankedWin";
  win: number;
  skunk: number;
  skunkKey?: "double";
  note: WinNote | null;
}

/** What the winner of a game is paid for the win and any skunk. Only for the winning seat. */
export function winPayout(i: WinInput): WinPayout {
  let reason: WinPayout["reason"];
  let base: number;
  if (i.kind === "bot") {
    if (!i.level) throw new Error("A win against the computer needs the computer's level");
    reason = "botWin";
    base = BOT_WIN[i.level];
  } else {
    reason = i.kind === "ranked" ? "rankedWin" : "onlineWin";
    base = i.kind === "ranked" ? RANKED_WIN : ONLINE_WIN;
  }
  const nothing = (note: WinNote): WinPayout => ({ reason, win: 0, skunk: 0, note });

  // Too short (or an early forfeit) comes first, so a short game never reports a cap.
  const long = longEnough(i.state, i.forfeited, i.durationMs);
  let note: WinNote | null = null;
  if (i.forfeited) {
    if (!long) return nothing("earlyForfeit");
    base = Math.ceil(base / 2);
    note = "lateForfeit";
  } else if (!long) {
    return nothing("short");
  }

  if (i.kind === "bot") {
    if (i.paidBotWinsToday >= BOT_WIN_CAP) return nothing("botCap");
  } else {
    if (i.paidOnlineWinsToday >= ONLINE_WIN_CAP) return nothing("onlineCap");
    if (i.paidWinsVsOpponentToday >= SAME_OPPONENT_CAP) return nothing("sameOpponent");
  }

  // A forfeit win never has a skunk bonus.
  let skunk = 0;
  let skunkKey: "double" | undefined;
  if (!i.forfeited && i.state.skunk === 2) {
    skunk = DOUBLE_SKUNK_BONUS;
    skunkKey = "double";
  } else if (!i.forfeited && i.state.skunk === 1) {
    skunk = SKUNK_BONUS;
  }

  let win = base;
  if (i.state.rules.targetScore < FULL_TARGET) {
    win = Math.ceil(win / 2);
    skunk = Math.ceil(skunk / 2);
  }
  return { reason, win, skunk, ...(skunkKey && { skunkKey }), note };
}

/** The UTC day of a moment, "2026-10-06". Daily limits and the first win of the day reset at 00:00 UTC. */
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** 00:00:00.000 UTC on the day of `d`. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The next 00:00:00.000 UTC after `d`, when the daily limits reset. */
export function nextDailyReset(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}
