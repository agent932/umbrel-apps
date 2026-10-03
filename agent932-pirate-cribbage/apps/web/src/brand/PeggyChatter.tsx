import { useEffect, useState } from "react";
import type { GameEvent, Seat } from "@pirate/engine";
import { useSettings } from "../settings.js";
import { Peggy } from "./Peggy.js";
import { quipFor } from "./quips.js";

/** Peggy pops up in the corner to squawk about the big moments. */
export function PeggyChatter({
  events,
  me,
  className = "fixed bottom-4 left-3",
}: {
  events: GameEvent[];
  me: Seat;
  /** Where she perches. */
  className?: string;
}) {
  const { peggy } = useSettings();
  const [line, setLine] = useState<{ text: string; key: number } | null>(null);

  useEffect(() => {
    if (!peggy) return;
    const text = quipFor(events, me);
    if (!text) return;
    const key = Date.now();
    // Shown from an effect because it reacts to new game events arriving.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLine({ text, key });
    const t = setTimeout(() => setLine((l) => (l?.key === key ? null : l)), 2200);
    return () => clearTimeout(t);
  }, [events, me, peggy]);

  if (!line) return null;
  return (
    <div
      key={line.key}
      role="status"
      aria-live="polite"
      className={`pointer-events-none z-30 flex items-end gap-1 ${className}`}
      style={{ animation: "pop-in 220ms ease-out" }}
    >
      <Peggy squawk className="h-20 w-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]" />
      <div className="mb-12 max-w-52 rounded-2xl rounded-bl-sm border border-gold/50 bg-night/90 px-3 py-2 text-sm font-bold text-moon shadow-xl">
        {line.text}
      </div>
    </div>
  );
}
