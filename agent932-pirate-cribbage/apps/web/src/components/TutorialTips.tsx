import { useEffect, useState } from "react";
import type { PlayerView } from "@pirate/engine";
import { Peggy } from "../brand/Peggy.js";

/** What Peggy explains the first time each part of the game comes round. */
const TIPS: Partial<Record<PlayerView["phase"], { title: string; text: string }>> = {
  cutForDeal: {
    title: "Ahoy, I'm Peggy!",
    text: "Cribbage is a race to 121 points, pegged on the board. First, pick any card from the deck. The lower card deals first (aces are low).",
  },
  discard: {
    title: "Feed the crib",
    text: "You've six cards. Throw two into the crib: a bonus hand that scores for the dealer at the end of the round. Keep the four that work best together (cards making 15, pairs, runs). Tap two cards, then Throw to crib.",
  },
  cut: {
    title: "The cut",
    text: "Now the deck is cut and the top card turned over. It counts as a fifth card for every hand. If it's a jack, the dealer scores 2 for his heels.",
  },
  pegging: {
    title: "Pegging",
    text: "Take turns playing cards, keeping a running count up to 31. Score 2 for making exactly 15 or 31, 2 for a pair, and 1 per card for a run of three or more. Can't play without passing 31? Say go, and your opponent scores 1. Tap a card or flick it up to play.",
  },
  roundEnd: {
    title: "The show",
    text: "Each hand is counted with the cut card: 2 for every set of cards adding to 15, 2 per pair, 1 per card in runs, 4 for a flush, and 1 for the jack matching the cut's suit (his nobs). Then the dealer counts the crib. The deal swaps each round.",
  },
  gameOver: {
    title: "That's cribbage!",
    text: "First to 121 wins. When ye're ready, try Pirate rules from the harbour: buried treasure, the Kraken and six pirate powers. Fair winds!",
  },
};

/**
 * Peggy's step-by-step guide over a practice game. Each part of the game gets its tip once; tips
 * wait in turn until you tap "Got it", even if the game has already moved on.
 */
export function TutorialTips({ phase }: { phase: PlayerView["phase"] }) {
  const [queue, setQueue] = useState<PlayerView["phase"][]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!TIPS[phase] || seen.has(phase)) return;
    // Queued from an effect because it reacts to the game moving on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue((q) => (q.includes(phase) ? q : [...q, phase]));
  }, [phase, seen]);
  const current = queue[0];
  const tip = current ? TIPS[current] : undefined;
  if (!current || !tip) return null;
  return (
    <aside
      key={current}
      className="fixed top-3 left-1/2 z-40 flex w-[min(94vw,560px)] -translate-x-1/2 items-start gap-3 rounded-2xl border-2 border-gold/70 bg-night/95 p-3 shadow-2xl"
      style={{ animation: "pop-in 260ms ease-out" }}
      aria-live="polite"
      aria-label="Peggy's tip"
    >
      <Peggy squawk className="h-16 w-auto shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 className="font-pirate text-xl leading-tight text-gold">{tip.title}</h2>
        <p className="text-sm text-parchment/90">{tip.text}</p>
      </div>
      <button
        type="button"
        className="btn-primary shrink-0 self-end px-3 py-1.5 text-sm"
        onClick={() => {
          setSeen((s) => new Set(s).add(current));
          setQueue((q) => q.slice(1));
        }}
      >
        Got it
      </button>
    </aside>
  );
}
