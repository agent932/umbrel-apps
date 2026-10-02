import type { Card as CardType } from "@pirate/engine";
import { cardLabel } from "@pirate/engine";

const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" } as const;
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NAME = [
  "",
  "Ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "Jack",
  "Queen",
  "King",
];

export function cardName(card: CardType) {
  return `${RANK_NAME[card.rank]} of ${SUIT_NAME[card.suit]}`;
}

interface CardProps {
  card?: CardType | null;
  /** Face down when no card is given or `hidden` is set. */
  hidden?: boolean;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Card({ card, hidden, selected, disabled, small, onClick, label }: CardProps) {
  const size = small ? "w-10 h-14 text-xs" : "w-14 h-20 text-sm sm:w-16 sm:h-24 sm:text-base";
  const faceDown = hidden || !card;
  const base = `${size} relative shrink-0 select-none rounded-lg border shadow-md transition-transform duration-150`;

  if (faceDown) {
    return (
      <div
        className={`${base} border-gold/60 bg-rum bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(0,0,0,.18)_6px_12px)]`}
        aria-label={label ?? "Face-down card"}
        role="img"
      >
        <span className="absolute inset-0 grid place-items-center text-lg text-parchment/80">
          ☠
        </span>
      </div>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const content = (
    <>
      <span className="absolute top-1 left-1.5 leading-none font-bold">
        {RANK[card.rank]}
        <br />
        {SUIT[card.suit]}
      </span>
      <span
        className={`absolute inset-0 grid place-items-center ${small ? "text-xl" : "text-3xl"}`}
      >
        {SUIT[card.suit]}
      </span>
    </>
  );
  const colors = `${red ? "text-red-700" : "text-slate-900"} bg-parchment border-stone-400`;
  const state = selected ? "-translate-y-3 ring-2 ring-gold" : "";

  if (!onClick) {
    return (
      <div className={`${base} ${colors}`} role="img" aria-label={label ?? cardName(card)}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${base} ${colors} ${state} ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:-translate-y-1"}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label ?? cardName(card)}
      data-card={cardLabel(card)}
    >
      {content}
    </button>
  );
}
