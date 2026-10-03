import { useSyncExternalStore } from "react";

export interface Settings {
  sound: boolean;
  /** How quickly Cap'n Bot plays. */
  speed: "slow" | "normal" | "fast";
  /** Peggy the parrot's commentary during games. */
  peggy: boolean;
  /** Short pirate animations for powers, treasure, the Kraken, the Black Spot and skunks. */
  animations: boolean;
}

const KEY = "pirate-cribbage:settings";
const DEFAULTS: Settings = { sound: true, speed: "normal", peggy: true, animations: true };
const listeners = new Set<() => void>();

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved (private mode); still applies for this visit.
  }
  for (const l of listeners) l();
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
    () => DEFAULTS,
  );
}

/** Multiplier for the bot's thinking time. */
export const SPEED_FACTOR: Record<Settings["speed"], number> = { slow: 1.7, normal: 1, fast: 0.4 };
