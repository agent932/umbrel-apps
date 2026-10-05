import {
  type Card as CardType,
  type GameEvent,
  type Seat,
  analyzeDiscard,
  cardText,
  handScoreParts,
} from "@pirate/engine";
import { Card } from "./Card.js";
import { CountThenShow } from "./Counting.js";

type ShowEvent = Extract<GameEvent, { type: "hand" | "crib" }>;

interface Props {
  show: ShowEvent[];
  cut: CardType | null;
  names: [string, string];
  onNext?: () => void;
  nextLabel?: string;
  /** Shown instead of the button while the other player hasn't moved on. */
  waitingNote?: string;
  /** Your six cards and throw this round, for the discard review. */
  decision?: { hand: CardType[]; discarded: CardType[] } | null;
  isDealer?: boolean;
  /** Skip the counting animation (tests). */
  instant?: boolean;
  /** How many hands have been counted out, so the board can move their pegs. */
  onReveal?: (counted: number) => void;
}

/** How your throw compared with the best one, by expected points (hand over every cut ± crib). */
export function DiscardReview({
  decision,
  isDealer,
}: {
  decision: { hand: CardType[]; discarded: CardType[] };
  isDealer: boolean;
}) {
  const a = analyzeDiscard(decision.hand, decision.discarded, isDealer);
  const cards = (cs: CardType[]) => cs.map(cardText).join(" ");
  const perfect = a.chosen === a.best;
  return (
    <section
      className="mb-3 rounded-lg border border-gold/30 p-3 text-sm"
      aria-label="Discard review"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Your throw: {cards(a.chosen.discard)}</span>
        <span
          className="num text-xl text-gold"
          title="Hand analyzer score (100 = best possible discard)"
        >
          {Math.round(a.score)}
        </span>
      </div>
      {perfect ? (
        <p className="mt-1 text-parchment/80">The best throw available. Well judged, captain!</p>
      ) : (
        <p className="mt-1 text-parchment/80">
          Best was {cards(a.best.discard)}, keeping {cards(a.best.keep)}: worth about{" "}
          {(a.best.ev - a.chosen.ev).toFixed(1)} more points on average.
        </p>
      )}
    </section>
  );
}

export function ShowList({ show, cut, names }: Pick<Props, "show" | "cut" | "names">) {
  return (
    <ul className="flex flex-col gap-3">
      {show.map((e, i) => (
        <li key={i} className="rounded-lg bg-sea-deep/70 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              {names[e.seat as Seat]} — {e.type === "crib" ? "crib" : "hand"}
            </span>
            <span className="num text-2xl text-gold">{e.score.total}</span>
          </div>
          <div className="flex items-center gap-1">
            {e.cards.map((c, j) => (
              <Card key={j} card={c} small />
            ))}
            {cut && (
              <>
                <span className="mx-1 text-parchment/50">+</span>
                <Card card={cut} small label="Cut card" />
              </>
            )}
          </div>
          <p className="mt-1.5 text-xs text-parchment/75">
            {e.score.total === 0
              ? "Nineteen — nothing at all!"
              : handScoreParts(e.score).join(", ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RoundSummary({
  show,
  cut,
  names,
  onNext,
  nextLabel = "Next round",
  waitingNote,
  decision,
  isDealer = false,
  instant,
  onReveal,
}: Props) {
  return (
    <Modal title="The Show" seeBoard>
      {/* Count each hand out in order first, then the totals and the next-round button. */}
      <CountThenShow show={show} cut={cut} names={names} instant={instant} onReveal={onReveal}>
        {decision && <DiscardReview decision={decision} isDealer={isDealer} />}
        <ShowList show={show} cut={cut} names={names} />
        {onNext && (
          <button type="button" className="btn-primary mt-4 w-full" onClick={onNext} autoFocus>
            {nextLabel}
          </button>
        )}
        {waitingNote && <p className="mt-4 text-center text-parchment/70">{waitingNote}</p>}
      </CountThenShow>
    </Modal>
  );
}

export function Modal({
  title,
  children,
  seeBoard,
}: {
  title: string;
  children: React.ReactNode;
  /** A lighter shade, so the pegs can be seen moving on the board behind while hands are counted. */
  seeBoard?: boolean;
}) {
  return (
    <div
      className={`dialog-shade z-20 ${seeBoard ? "bg-black/25" : "bg-black/60"}`}
      role="dialog"
      aria-label={title}
    >
      <div className="panel w-full max-w-md p-5">
        <h2 className="scroll-title mx-auto mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
