import { AnimatePresence, motion } from "motion/react";
import { type PlayerView, type Seat, cardLabel } from "@pirate/engine";
import { Card } from "../Card.js";
import type { PilePlay } from "./tableHooks.js";

/** The middle of the table: the deck and cut card, the count and pegging pile, and the crib. */
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
  return (
    <div className="t-play flex items-center justify-between gap-2 px-[3cqw]">
      <div className="t-stack" aria-label={view.cut ? "Deck and cut card" : "Deck"}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute" style={{ left: -i * 2, top: -i * 2 }}>
            <Card fluid hidden label="Deck" />
          </div>
        ))}
        {view.cut && (
          <motion.div
            className="absolute"
            style={{ left: "22%", top: "-12%", rotate: 8 }}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
          >
            <Card card={view.cut} fluid label={`Cut card: ${cardLabel(view.cut)}`} />
          </motion.div>
        )}
        <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-parchment/75">
          {view.cut ? "Cut" : "Deck"}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        {showPile && (
          <>
            <span className="t-medallion" aria-label={`Count ${count}`}>
              {count}
            </span>
            <div className="t-pile flex">
              <AnimatePresence>
                {pile.map((p) => (
                  <motion.div
                    key={cardLabel(p.card)}
                    // From your hand below, or flipping over from the opponent's fan above.
                    initial={
                      p.seat === me
                        ? { y: "32vh", opacity: 0, scale: 1.15 }
                        : { y: "-28vh", opacity: 0, rotateY: 90 }
                    }
                    animate={{ y: 0, opacity: 1, scale: 1, rotateY: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  >
                    <Card card={p.card} fluid />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      <div className="t-stack" aria-label={cribLabel}>
        {Array.from({ length: Math.min(view.cribCount, 4) }, (_, i) => (
          <div key={i} className="absolute" style={{ left: i * 2, top: -i * 2 }}>
            <Card fluid hidden label="Crib card" />
          </div>
        ))}
        {view.cribCount === 0 && (
          <div className="h-full w-full rounded-lg border border-dashed border-parchment/35" />
        )}
        {/* Anchored right: the crib sits at the table's right edge, so long names grow inward. */}
        <span className="absolute top-full right-0 mt-1 text-right text-[11px] whitespace-nowrap text-parchment/75">
          {cribLabel}
        </span>
      </div>
    </div>
  );
}
