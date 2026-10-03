import { useEffect, useState } from "react";
import {
  type Card as CardType,
  type GameEvent,
  type PlayerView,
  type Seat,
  cardText,
} from "@pirate/engine";
import { Card } from "./Card.js";

/**
 * The cut for first deal: the deck fanned out face down; tap a card to cut it.
 * Lowest card deals (aces low).
 */
export function CutForDealPanel({
  view,
  names,
  onPick,
}: {
  view: PlayerView;
  names: [string, string];
  onPick: (index: number) => void;
}) {
  const cfd = view.cutForDeal;
  const me = view.seat;
  const opp = (1 - me) as Seat;
  const myTurn = view.toAct.includes(me);
  const size = cfd?.deckSize ?? 0;

  return (
    <section className="panel flex flex-col items-center gap-4 p-4" aria-label="Cut for the deal">
      <h2 className="font-pirate text-3xl text-gold">Cut for the deal</h2>
      <p className="text-center text-sm text-parchment/80">
        {myTurn
          ? "Pick a card. Low card deals first (aces are low)."
          : `Waiting for ${names[opp]} to cut…`}
      </p>

      {/* The fanned deck: a gentle arc of face-down cards. */}
      <div className="relative h-24 w-full max-w-xl" role="group" aria-label="Deck to cut">
        {Array.from({ length: size }, (_, i) => {
          if (cfd?.taken.includes(i)) return null;
          const t = size > 1 ? i / (size - 1) : 0.5;
          const fromCentre = t - 0.5;
          return (
            <button
              key={i}
              type="button"
              disabled={!myTurn}
              onClick={() => onPick(i)}
              aria-label={`Cut card ${i + 1}`}
              className="absolute top-2 transition-transform duration-150 enabled:hover:-translate-y-3 disabled:cursor-default"
              style={{
                left: `calc(${t} * (100% - 2.5rem))`,
                transform: `translateY(${fromCentre * fromCentre * 40}px) rotate(${fromCentre * 50}deg)`,
              }}
            >
              <Card small hidden label="Face-down card to cut" />
            </button>
          );
        })}
      </div>

      <div className="flex gap-8">
        {([me, opp] as Seat[]).map((seat) => (
          <div key={seat} className="flex flex-col items-center gap-1 text-sm">
            {cfd?.cards[seat] ? (
              <Card
                card={cfd.cards[seat]}
                label={`${names[seat]} cut ${cardText(cfd.cards[seat]!)}`}
              />
            ) : (
              <div className="grid h-20 w-14 place-items-center rounded-lg border border-dashed border-parchment/30 text-parchment/40 sm:h-24 sm:w-16">
                ?
              </div>
            )}
            <span>{names[seat]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** A short reveal after both have cut: the two cards and who deals first. */
export function CutReveal({
  events,
  names,
  me,
}: {
  events: GameEvent[];
  names: [string, string];
  me: Seat;
}) {
  const done = events.find(
    (e): e is Extract<GameEvent, { type: "cutForDealt" }> => e.type === "cutForDealt",
  );
  const [shown, setShown] = useState<{ cards: [CardType, CardType]; dealer: Seat } | null>(null);
  useEffect(() => {
    if (!done) return;
    // Shown when the dealer is decided.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ cards: done.cards, dealer: done.dealer });
  }, [done]);
  // Hides itself after a moment. Its own timer: new game events (like the deal) arriving must
  // not cancel it, or the reveal would stay up until tapped.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 2400);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  const meDeal = shown.dealer === me;
  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4"
      role="status"
      onClick={() => setShown(null)}
      style={{ animation: "pop-in 220ms ease-out" }}
    >
      <div className="panel flex flex-col items-center gap-3 p-5 text-center">
        <div className="flex gap-6">
          {([0, 1] as Seat[]).map((seat) => (
            <div key={seat} className="flex flex-col items-center gap-1 text-sm">
              <Card card={shown.cards[seat]} />
              <span className={seat === shown.dealer ? "font-bold text-gold" : ""}>
                {names[seat]}
              </span>
            </div>
          ))}
        </div>
        <p className="font-pirate text-3xl text-gold">
          {meDeal ? "You deal first!" : `${names[shown.dealer]} deals first`}
        </p>
        <p className="text-xs text-parchment/60">Low card deals · tap to continue</p>
      </div>
    </div>
  );
}
