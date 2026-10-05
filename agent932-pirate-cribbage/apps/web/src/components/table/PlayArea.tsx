import { AnimatePresence, motion } from "motion/react";
import { type Card as CardType, type PlayerView, type Seat, cardLabel } from "@pirate/engine";
import { Card } from "../Card.js";
import type { PilePlay } from "./tableHooks.js";

/** A small, steady tilt for each card on the pile (the same card always leans the same way). */
export function pileTilt(card: CardType) {
  const n = card.rank * 7 + "SHDC".indexOf(card.suit) * 3;
  return ((n % 7) - 3) * 1.6;
}

/**
 * The middle of the table, as three pieces the table places on its own: the pegging pile with the
 * count medallion, the deck with the cut card on top, and the crib (on the dealer's side).
 */
export function PlayArea({
  view,
  me,
  pile,
  count,
  showPile,
  cribLabel,
}: {
  view: PlayerView;
  me: Seat;
  pile: PilePlay[];
  count: number;
  /** Pegging is on (or its last cards are still showing). */
  showPile: boolean;
  cribLabel: string;
}) {
  const myCrib = view.cribOwner === me || (view.cribOwner === null && view.dealer === me);
  return (
    <>
      <div className="t-pile-zone">
        {showPile && (
          <>
            <div
              className="t-pile"
              style={{ "--pn": Math.max(pile.length, 1) } as React.CSSProperties}
            >
              <AnimatePresence>
                {pile.map((p) => (
                  <motion.div
                    key={cardLabel(p.card)}
                    className="t-pile-card"
                    // From your hand below, or flipping over from the opponent's fan above.
                    initial={
                      p.seat === me
                        ? { y: "32vh", opacity: 0, scale: 1.15 }
                        : { y: "-28vh", opacity: 0, rotateY: 90 }
                    }
                    animate={{ y: 0, opacity: 1, scale: 1, rotateY: 0, rotate: pileTilt(p.card) }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  >
                    <Card card={p.card} fluid />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <span className="t-medallion" aria-label={`Count ${count}`}>
              {count}
            </span>
          </>
        )}
      </div>

      <div className="t-deck t-stack" aria-label={view.cut ? "Deck and cut card" : "Deck"}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute" style={{ left: -i * 2, top: -i * 2 }}>
            <Card fluid hidden label="Deck" />
          </div>
        ))}
        {view.cut && (
          <motion.div
            className="absolute"
            style={{ left: -6, top: -8, rotate: 4 }}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
          >
            <Card card={view.cut} fluid label={`Cut card: ${cardLabel(view.cut)}`} />
          </motion.div>
        )}
        <span className="t-stack-label">{view.cut ? "Cut" : "Deck"}</span>
      </div>

      <div className={`t-crib t-stack ${myCrib ? "mine" : "theirs"}`} aria-label={cribLabel}>
        <div className="t-crib-cards">
          {Array.from({ length: Math.min(view.cribCount, 4) }, (_, i) => (
            <div key={i} className="absolute" style={{ left: i * 2, top: -i * 2 }}>
              <Card fluid hidden label="Crib card" />
            </div>
          ))}
          {view.cribCount === 0 && (
            <div className="h-full w-full rounded-lg border border-dashed border-parchment/35" />
          )}
        </div>
        <span className="t-stack-label">{cribLabel}</span>
      </div>
    </>
  );
}
