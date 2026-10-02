import { type Card as CardType, type GameEvent, type Seat, handScoreParts } from "@pirate/engine";
import { Card } from "./Card.js";

type ShowEvent = Extract<GameEvent, { type: "hand" | "crib" }>;

interface Props {
  show: ShowEvent[];
  cut: CardType | null;
  names: [string, string];
  onNext?: () => void;
  nextLabel?: string;
}

export function ShowList({ show, cut, names }: Omit<Props, "onNext">) {
  return (
    <ul className="flex flex-col gap-3">
      {show.map((e, i) => (
        <li key={i} className="rounded-lg bg-sea-deep/70 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              {names[e.seat as Seat]} — {e.type === "crib" ? "crib" : "hand"}
            </span>
            <span className="font-serif text-2xl font-bold text-gold">{e.score.total}</span>
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

export function RoundSummary({ show, cut, names, onNext, nextLabel = "Next round" }: Props) {
  return (
    <Modal title="The Show">
      <ShowList show={show} cut={cut} names={names} />
      {onNext && (
        <button type="button" className="btn-primary mt-4 w-full" onClick={onNext} autoFocus>
          {nextLabel}
        </button>
      )}
    </Modal>
  );
}

export function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-label={title}
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gold/40 bg-sea p-5 shadow-2xl">
        <h2 className="mb-3 text-center font-pirate text-3xl text-gold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
