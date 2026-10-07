import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native.js";

/** The iPhone app's own plugin (ios/App/App/AppBridgeViewController.swift): Apple's rating prompt. */
const ReviewPrompt = registerPlugin<{ request(): Promise<void> }>("ReviewPrompt");

const KEY = "deckhand.rating";
const DAY_MS = 24 * 60 * 60 * 1000;
/** First ask after this many wins. */
export const FIRST_ASK_AFTER_WINS = 3;
/** Then at most again after this many more wins and this many days. */
export const ASK_AGAIN_AFTER_WINS = 20;
export const ASK_AGAIN_AFTER_DAYS = 120;

/** Wins since the last ask, and when we last asked (ms since epoch). */
export interface RatingState {
  wins: number;
  askedAt: number | null;
}

/** Whether to ask for a rating now, given the wins counted so far (including this one). */
export function shouldAsk(state: RatingState, now: number): boolean {
  if (state.askedAt === null) return state.wins >= FIRST_ASK_AFTER_WINS;
  return state.wins >= ASK_AGAIN_AFTER_WINS && now - state.askedAt >= ASK_AGAIN_AFTER_DAYS * DAY_MS;
}

function load(): RatingState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<RatingState> | null;
    if (v && typeof v.wins === "number") return { wins: v.wins, askedAt: v.askedAt ?? null };
  } catch {
    // Nothing saved, or storage blocked: start counting afresh.
  }
  return { wins: 0, askedAt: null };
}

function save(state: RatingState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: we may ask a little early or late, which is harmless.
  }
}

/**
 * A game won in the iPhone app: count it, and say whether now's the moment to ask for an App Store
 * rating (after the 3rd win, then rarely). Apple still decides whether the stars actually show, at
 * most three times a year. Never on the web.
 */
export function countWinForRating(now = Date.now(), native = isNativeApp): boolean {
  if (!native) return false;
  const state = load();
  state.wins += 1;
  const ask = shouldAsk(state, now);
  save(ask ? { wins: 0, askedAt: now } : state);
  return ask;
}

/** Show Apple's "Enjoying Deckhand Games?" stars. */
export function requestAppReview() {
  void ReviewPrompt.request().catch(() => {
    // An older app build without the plugin: nothing to show.
  });
}
