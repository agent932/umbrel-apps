import { type Card as CardType, cardLabel, cardValue, sameCard } from "@pirate/engine";
import { Card } from "../Card.js";
import { HandSlot } from "./HandSlot.js";

/** Your hand, fanned along the bottom edge. Cards marked "in crib" are back in play for Rebury. */
export function PlayerHand({
  cards,
  hand,
  round,
  selected,
  count,
  myTurnToPeg,
  choosing,
  onCard,
}: {
  /** The cards shown: your hand, plus your crib cards while Rebury could pick them. */
  cards: CardType[];
  /** The cards actually in your hand. */
  hand: CardType[];
  round: number;
  selected: CardType[];
  count: number;
  myTurnToPeg: boolean;
  /** Picking cards (for the crib or a power) rather than playing them. */
  choosing: boolean;
  onCard: (c: CardType) => void;
}) {
  const isSelected = (c: CardType) => selected.some((s) => sameCard(s, c));
  return (
    <div className="t-hand" aria-label="Your hand">
      {cards.map((c, i) => {
        const inCrib = !hand.some((h) => sameCard(h, c));
        const playable = myTurnToPeg && count + cardValue(c) <= 31;
        const clickable = choosing || playable;
        return (
          <HandSlot
            key={`${round}-${cardLabel(c)}`}
            i={i}
            n={cards.length}
            selected={isSelected(c)}
            playable={playable}
            tooHigh={myTurnToPeg && !playable}
            onFlick={clickable ? () => onCard(c) : undefined}
          >
            <Card
              card={c}
              fluid
              selected={isSelected(c)}
              disabled={!clickable}
              onClick={() => onCard(c)}
            />
            {inCrib && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-night/85 px-2 text-[11px] whitespace-nowrap text-gold">
                in crib
              </span>
            )}
          </HandSlot>
        );
      })}
    </div>
  );
}
