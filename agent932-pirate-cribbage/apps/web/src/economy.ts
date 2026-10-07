import {
  ACHIEVEMENTS,
  BOT_WIN_CAP,
  type BotLevel,
  type DoubloonLine,
  MIN_GAME_MS,
  MIN_ROUNDS,
  ONLINE_WIN_CAP,
  SAME_OPPONENT_CAP,
  type WinNote,
  nextDailyReset,
} from "@pirate/engine";
import { BOT_CREW } from "./brand/botCrew.js";

/** An achievement's name, for doubloon lines and the admin ledger. */
export const achievementName = (key: string) =>
  ACHIEVEMENTS.find((a) => a.key === key)?.name ?? "Achievement";

/** What one line of doubloons was paid for, e.g. "Beat Bosun Barnaby" or "Double skunk bonus". */
export function lineLabel(line: Pick<DoubloonLine, "reason" | "key">, level?: BotLevel | null) {
  switch (line.reason) {
    case "botWin":
      return level ? `Beat ${BOT_CREW[level].name}` : "Win vs the computer";
    case "onlineWin":
      return "Online win";
    case "rankedWin":
      return "Ranked win";
    case "skunk":
      return line.key === "double" ? "Double skunk bonus" : "Skunk bonus";
    case "firstWinOfDay":
      return "First win of the day";
    case "daily":
      return line.key === "best" ? "Best throw" : "Daily discard";
    case "achievement":
      return line.key ? achievementName(line.key) : "Achievement";
    case "admin":
      return "Adjustment";
  }
}

/** When the daily limits reset (00:00 UTC), in the player's own time, e.g. "6:00 PM". */
export const resetTime = (now = new Date()) =>
  nextDailyReset(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Why a win paid nothing, or only half, in words. */
export function noteText(note: WinNote, oppName: string, now = new Date()) {
  switch (note) {
    case "short":
      return `Games under ${MIN_ROUNDS} rounds or ${MIN_GAME_MS / 60_000} minutes don't pay doubloons.`;
    case "earlyForfeit":
      return "Early forfeits don't pay doubloons.";
    case "lateForfeit":
      return "Half bounty: your opponent abandoned ship.";
    case "botCap":
      return `Daily bot bounty reached (${BOT_WIN_CAP} wins). Online wins still pay. Resets at ${resetTime(now)}.`;
    case "onlineCap":
      return `Daily online bounty reached (${ONLINE_WIN_CAP} wins). Resets at ${resetTime(now)}.`;
    case "sameOpponent":
      return `You've had ${SAME_OPPONENT_CAP} paid wins against ${oppName} today. Resets at ${resetTime(now)}.`;
  }
}

/**
 * A fresh random id for an admin adjustment, so a retry can't pay twice. crypto.randomUUID only
 * exists on secure (https) pages, and a home server is often reached over plain http.
 */
export function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // the RFC variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
