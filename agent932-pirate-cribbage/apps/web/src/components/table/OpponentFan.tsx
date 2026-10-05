import { type Card as CardType, cardLabel } from "@pirate/engine";
import { Card } from "../Card.js";

/** Where card i of n sits in a fan (the fan's shape is in `.t-slot` CSS). */
export const fan = (i: number, n: number) => ({ "--i": i, "--n": n }) as React.CSSProperties;

/** The opponent's cards along the top edge: face down, or face up through the spyglass. */
export function OpponentFan({
  spied,
  count,
  round,
}: {
  /** Their hand, when the spyglass shows it. */
  spied: CardType[] | null;
  count: number;
  round: number;
}) {
  if (spied) {
    return (
      <div className="t-opp-fan" aria-label="Opponent's hand seen through the spyglass">
        {spied.map((c, i) => (
          <div key={cardLabel(c)} className="t-slot" style={fan(i, spied.length)}>
            <Card card={c} fluid />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="t-opp-fan" aria-label={`Opponent holds ${count} cards`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={`${round}-${i}`} className="t-slot" style={fan(i, count)}>
          <div className="t-deal-in">
            <Card fluid hidden />
          </div>
        </div>
      ))}
    </div>
  );
}
