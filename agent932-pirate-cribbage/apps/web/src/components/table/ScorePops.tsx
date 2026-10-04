import { useEffect, useState } from "react";
import type { GameEvent, PegScore, Seat } from "@pirate/engine";
import { buzz } from "../../haptics.js";

interface Pop {
  key: number;
  text: string;
  why: string;
  /** Whose points: "You" or the opponent's name. */
  who: string;
  mine: boolean;
  bad?: boolean;
}

function pegWhy(s: PegScore) {
  const parts: string[] = [];
  if (s.fifteen) parts.push("fifteen");
  if (s.thirtyOne) parts.push("thirty-one");
  if (s.pairs === 2) parts.push("a pair");
  if (s.pairs === 6) parts.push("pair royal");
  if (s.pairs === 12) parts.push("double pair royal");
  if (s.run) parts.push(`run of ${s.run}`);
  return parts.join(" + ");
}

/** The points scored in a batch of events while playing (the show at round end counts its own). */
function popsFor(events: GameEvent[], me: Seat, names: [string, string]): Omit<Pop, "key">[] {
  const pops: Omit<Pop, "key" | "who">[] = [];
  const whose: string[] = [];
  for (const e of events) {
    const mine = "seat" in e && e.seat === me;
    const before = pops.length;
    if (e.type === "played" && e.score.total > 0)
      pops.push({ text: `+${e.score.total}`, why: pegWhy(e.score), mine });
    if (e.type === "go") pops.push({ text: "+1", why: "a go", mine });
    if (e.type === "lastCard") pops.push({ text: "+1", why: "last card", mine });
    if (e.type === "heels") pops.push({ text: "+2", why: "his heels", mine });
    if (e.type === "treasure") pops.push({ text: `+${e.points}`, why: "buried treasure", mine });
    if (e.type === "kraken")
      pops.push({ text: `−${Math.abs(e.points)}`, why: "the Kraken", mine, bad: true });
    if (pops.length > before && "seat" in e) whose.push(mine ? "You" : names[e.seat]);
  }
  return pops.map((p, i) => ({ ...p, who: whose[i] ?? "" }));
}

/** "+2 fifteen" floats up from the play and drifts toward the board. */
export function ScorePops({
  events,
  me,
  names,
}: {
  events: GameEvent[];
  me: Seat;
  names: [string, string];
}) {
  const [pops, setPops] = useState<Pop[]>([]);
  useEffect(() => {
    const next = popsFor(events, me, names);
    if (!next.length) return;
    const now = Date.now();
    // Shown from an effect because it reacts to new game events arriving.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPops((p) => [...p, ...next.map((n, i) => ({ ...n, key: now + i }))]);
    if (next.some((n) => n.mine && !n.bad)) buzz(20);
    const t = setTimeout(() => setPops((p) => p.filter((x) => x.key < now)), 1600);
    return () => clearTimeout(t);
    // Names only change between games; the pops react to events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, me]);

  return (
    <div className="t-pops" aria-hidden>
      {pops.map((p, i) => (
        <div
          key={p.key}
          className={`t-pop ${p.mine ? "mine" : "theirs"} ${p.bad ? "bad" : ""}`}
          style={{ animationDelay: `${i * 120}ms` }}
        >
          <span className="t-pop-who">{p.who}</span>
          <span className="t-pop-num">{p.text}</span>
          {p.why && <span className="t-pop-why">{p.why}</span>}
        </div>
      ))}
    </div>
  );
}
