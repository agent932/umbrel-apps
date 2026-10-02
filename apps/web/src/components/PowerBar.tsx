import { POWER_INFO, type PowerId } from "@pirate/engine";

export const POWER_ICONS: Record<PowerId, string> = {
  spyglass: "🔭",
  crowsNest: "🦅",
  parley: "🤝",
  pickpocket: "🪝",
  rebury: "⛏️",
  belay: "⚓",
};

interface PowerBarProps {
  powers: PowerId[];
  left: PowerId[];
  /** Powers whose timing and card selection are right, so the button works now. */
  ready: PowerId[];
  cost: number;
  onUse: (power: PowerId) => void;
  hint?: Partial<Record<PowerId, string>>;
}

export function PowerBar({ powers, left, ready, cost, onUse, hint = {} }: PowerBarProps) {
  if (powers.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Pirate powers">
      {powers.map((p) => {
        const used = !left.includes(p);
        const usable = ready.includes(p);
        const info = POWER_INFO[p];
        return (
          <button
            key={p}
            type="button"
            disabled={!usable}
            onClick={() => onUse(p)}
            title={`${info.description}${cost ? ` Costs ${cost} points.` : ""}${hint[p] ? ` ${hint[p]}` : ""}`}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              used
                ? "border-transparent text-parchment/30 line-through"
                : usable
                  ? "border-gold bg-gold/20 text-parchment hover:bg-gold/35"
                  : "border-parchment/20 text-parchment/55"
            }`}
          >
            <span aria-hidden>{POWER_ICONS[p]}</span> {info.name}
          </button>
        );
      })}
    </div>
  );
}
