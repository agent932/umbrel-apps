import { type Card as CardType, type PowerId, POWER_INFO } from "@pirate/engine";
import { POWER_ART } from "../../brand/powerArt.js";

export const POWER_HINTS: Partial<Record<PowerId, string>> = {
  parley: "Select one card first.",
  pickpocket: "Select one card from your hand first.",
  rebury: "Select the two cards you want in the crib.",
};

/** The powers you could use right now: ones that need cards selected first only light up once the selection fits. */
export function readyPowers(
  powersNow: PowerId[],
  selected: CardType[],
  inHand: (c: CardType) => boolean,
): PowerId[] {
  return powersNow.filter((p) => {
    if (p === "parley") return selected.length === 1;
    if (p === "pickpocket") return selected.length === 1 && inHand(selected[0]!);
    if (p === "rebury") return selected.length === 2;
    return true;
  });
}

/** The round power buttons down the table's edge. Tapping one opens its explanation. */
export function PowersRail({
  powers,
  powersLeft,
  ready,
  onOpen,
}: {
  powers: PowerId[];
  powersLeft: PowerId[];
  ready: PowerId[];
  onOpen: (power: PowerId) => void;
}) {
  if (powers.length === 0) return null;
  return (
    <div
      className={`t-powers ${powers.length > 4 ? "many" : ""}`}
      role="group"
      aria-label="Pirate powers"
    >
      {powers.map((power) => {
        const used = !powersLeft.includes(power);
        const usable = ready.includes(power);
        const info = POWER_INFO[power];
        const hint = POWER_HINTS[power];
        return (
          <button
            key={power}
            type="button"
            className={`t-round ${used ? "used" : usable ? "ready" : "idle"}`}
            style={{ backgroundImage: `url("${POWER_ART[power]}")` }}
            onClick={() => onOpen(power)}
            aria-label={info.name}
            aria-haspopup="dialog"
            title={`${info.name}: ${info.description}${hint && !used ? ` ${hint}` : ""}`}
          />
        );
      })}
    </div>
  );
}

/** When and how to use each power, in plain words. */
const POWER_HOW: Record<PowerId, string> = {
  spyglass:
    "Use it while you're choosing your crib cards. Your opponent's hand is shown face up until you discard.",
  crowsNest:
    "Use it while you're choosing your crib cards. The cut card is turned over early, for both of you, so you know it before you throw.",
  parley:
    "While you're choosing your crib cards, tap the one card you'd like to swap, then use Parley. It's replaced by the top card of the deck.",
  pickpocket:
    "After the cut, while Set sail is showing: tap one card from your hand to give away, then use Pickpocket. You take a random card from your opponent's hand.",
  rebury:
    "After the cut, while Set sail is showing: tap the two cards you want in the crib (cards marked 'in crib' count too), then use Rebury.",
  belay:
    "During pegging, straight after you play a card and before your opponent answers: use Belay That! to take your card back.",
};

/** What a pirate power does, how to use it, and a button to use it when it's ready. */
export function PowerPanel({
  power,
  used,
  usable,
  availableNow,
  cost,
  onUse,
  onClose,
}: {
  power: PowerId;
  used: boolean;
  usable: boolean;
  /** The right moment for it, though the card selection may not be ready yet. */
  availableNow: boolean;
  cost: number;
  onUse: () => void;
  onClose: () => void;
}) {
  const info = POWER_INFO[power];
  const status = used
    ? { text: "You've already used it this game.", tone: "text-parchment/60" }
    : usable
      ? { text: "Ready to use now.", tone: "text-gold" }
      : availableNow
        ? { text: POWER_HINTS[power] ?? "Not quite yet.", tone: "text-parchment" }
        : { text: "Not available right now.", tone: "text-parchment/70" };
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-label={info.name}
    >
      <div
        className="panel flex max-h-[94dvh] w-full max-w-sm flex-col items-center gap-2.5 overflow-y-auto p-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={POWER_ART[power]}
          alt=""
          className={`h-14 w-14 shrink-0 sm:h-20 sm:w-20 ${used ? "grayscale" : ""}`}
        />
        <h2 className="scroll-title !text-2xl">{info.name}</h2>
        <p className="font-bold">{info.description}</p>
        <p className="text-sm text-parchment/85">{POWER_HOW[power]}</p>
        {cost > 0 && <p className="text-sm text-red-200">Costs {cost} points each time.</p>}
        <p className={`text-sm font-bold ${status.tone}`} role="status">
          {status.text}
        </p>
        <div className="flex w-full gap-2">
          {usable && (
            <button type="button" className="btn-primary flex-1" onClick={onUse} autoFocus>
              Use {info.name}
            </button>
          )}
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            {usable ? "Not now" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
