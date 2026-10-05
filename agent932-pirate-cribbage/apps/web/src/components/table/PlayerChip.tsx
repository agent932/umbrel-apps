import { useEffect, useState } from "react";
import type { PowerId } from "@pirate/engine";
import { PEG_COLORS, POWER_ART } from "../../brand/powerArt.js";
import hourglassUrl from "../../assets/ui/icon-hourglass.webp";

/** A player's plaque: portrait, name, dealer tag, score, powers left and any call-out. */
export function PlayerChip({
  className,
  name,
  score,
  dealer,
  you,
  image,
  powersLeft,
  offline,
  returnBy,
  callout,
  children,
}: {
  className: string;
  name: string;
  score: number;
  dealer: boolean;
  you?: boolean;
  /** A painted portrait instead of an initial. */
  image?: string | null;
  powersLeft?: PowerId[];
  offline?: boolean;
  /** When an offline opponent forfeits unless they're back. */
  returnBy?: number | null;
  /** Something they just called out ("Arr!"), shown in a speech bubble. */
  callout?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className={`t-chip relative ${className}`} aria-label={name}>
      {callout && (
        <span className="t-callout" role="status">
          {callout}
        </span>
      )}
      <span
        className="t-avatar"
        style={image ? { background: `url("${image}") center / 118% no-repeat` } : undefined}
        aria-hidden
      >
        {image ? "" : name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm leading-tight font-bold">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: you ? PEG_COLORS.me : PEG_COLORS.opponent }}
          />
          <span className="truncate">{name}</span>
          {dealer && (
            <span className="rounded bg-rum px-1 text-[9px] tracking-wide uppercase">dealer</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-xl leading-none text-gold" aria-label={`${name} score`}>
            {score}
          </span>
          {powersLeft && powersLeft.length > 0 && (
            <span className="flex gap-0.5" title="Powers left">
              {powersLeft.map((p) => (
                <img key={p} src={POWER_ART[p]} alt={p} className="h-4 w-4" />
              ))}
            </span>
          )}
          {offline && (
            <span className="rounded bg-red-900/70 px-1 text-[10px] uppercase" role="status">
              offline{returnBy ? <ReturnClock until={returnBy} /> : null}
            </span>
          )}
          {children}
        </span>
      </span>
    </section>
  );
}

/** Seconds left before the server moves for you. */
export function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`ml-2 tabular-nums ${secs <= 10 ? "text-red-300" : "text-parchment/60"}`}
      title="Time to move"
    >
      <img src={hourglassUrl} alt="" className="mr-0.5 inline h-4 w-4 align-[-3px]" />
      {secs}s
    </span>
  );
}

/** "· 4:12 to return": time left for a disconnected player before they forfeit. */
function ReturnClock({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.ceil((until - now) / 1000));
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return <span className="normal-case tabular-nums"> · {text} to return</span>;
}
