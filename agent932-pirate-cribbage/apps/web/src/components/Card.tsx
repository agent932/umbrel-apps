import type { Card as CardType } from "@pirate/engine";
import { cardLabel } from "@pirate/engine";
import cardBackUrl from "../assets/table/card-back.webp";

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
  /** Sized by the table: height comes from the `--h` CSS variable (see `.t-card`). */
  fluid?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Card({
  card,
  hidden,
  selected,
  disabled,
  small,
  fluid,
  onClick,
  label,
}: CardProps) {
  const size = fluid
    ? "t-card"
    : small
      ? "w-10 h-14 text-[11px]"
      : "w-14 h-20 text-sm sm:w-16 sm:h-24 sm:text-base";
  const faceDown = hidden || !card;
  const base = `${size} relative shrink-0 select-none rounded-lg shadow-[0_4px_10px_-2px_rgba(0,0,0,0.55)] transition-transform duration-150`;

  if (faceDown) {
    return (
      <div
        className={`${base} bg-cover bg-center`}
        // Quoted: Vite may inline the SVG as a data URI containing quotes and spaces.
        style={{ backgroundImage: `url("${cardBackUrl}")` }}
        aria-label={label ?? "Face-down card"}
        role="img"
      />
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const face = card.rank >= 11;
  const index = (
    <span className="flex flex-col items-center leading-none font-extrabold">
      <span>{RANK[card.rank]}</span>
      <span className="-mt-px">{SUIT[card.suit]}</span>
    </span>
  );
  const content = (
    <>
      {/* Thin inner frame, like a printed card. */}
      <span className="pointer-events-none absolute inset-[3px] rounded-[5px] border border-[#c9b58a]/60" />
      <span className="absolute top-1 left-1">{index}</span>
      <span className="absolute right-1 bottom-1 rotate-180">{index}</span>
      <span className="absolute inset-0 grid place-items-center">
        {face ? (
          <span
            className={`font-pirate leading-none ${fluid ? "text-[2.6em]" : small ? "text-2xl" : "text-4xl sm:text-5xl"}`}
          >
            {RANK[card.rank]}
          </span>
        ) : (
          <span
            className={`leading-none ${fluid ? "text-[2.3em]" : small ? "text-xl" : "text-3xl sm:text-4xl"}`}
          >
            {SUIT[card.suit]}
          </span>
        )}
      </span>
    </>
  );
  const colors = `${red ? "text-[#b8322b]" : "text-[#1c2430]"} bg-[linear-gradient(160deg,#fdf7e4,#efe2bd)] border border-[#b7a374]`;
  // On the table the card's slot does the lifting; elsewhere the card lifts itself.
  const lift = selected
    ? `${fluid ? "" : "-translate-y-3"} ring-2 ring-gold shadow-[0_0_18px_rgba(242,184,75,0.55)]`
    : "";

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
      className={`${base} ${colors} ${lift} ${disabled ? "cursor-not-allowed brightness-[.8] saturate-[.7]" : `cursor-pointer ${fluid ? "" : "hover:-translate-y-1"}`}`}
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
