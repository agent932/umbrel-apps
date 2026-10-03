import { useId } from "react";
import { KRAKEN_HOLES, TREASURE_HOLES, type RuleSet } from "@pirate/engine";

interface BoardProps {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  /** Your seat: your lane is drawn at the bottom, with blue pegs (the opponent's are red). */
  me?: 0 | 1;
}

const W = 400;
const H = 92;
const HOLES_PER_ROW = 60;
const GAP = 5.6;
const X0 = 14;

/** Peg colours: blue for you, red for your opponent (same as the dots by each name). */
export const PEG_COLORS = { me: "#3d8bfd", opponent: "#e5383b" };

/** Hole n (1..120) → position. Each player has two rows: 1–60 left to right, 61–120 back. */
function holeXY(n: number, lane: number) {
  const row = n <= HOLES_PER_ROW ? 0 : 1;
  const i = row === 0 ? n - 1 : 2 * HOLES_PER_ROW - n;
  const groupGap = Math.floor(i / 5) * 2;
  return { x: X0 + i * GAP + groupGap, y: 14 + lane * 40 + row * 16 };
}

function pegXY(score: number, lane: number) {
  if (score <= 0) return { x: 6, y: 14 + lane * 40 + 8 };
  if (score >= 121) return { x: holeXY(1, lane).x - 8, y: 14 + lane * 40 + 8 };
  return holeXY(score, lane);
}

/** One player's two rows, as a channel carved into the board. */
const laneRect = (lane: number) => ({ x: 9, y: 7 + lane * 40, width: W - 18, height: 30, rx: 6 });

/** A carved wooden cribbage board: bevelled edge, recessed lanes, drilled holes, shadowed pegs. */
export function Board({ scores, backPegs, rules, names, me = 0 }: BoardProps) {
  // Unique ids so two boards on one page never share gradients.
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  const pirate = rules.pirate;
  const lanes = [1 - me, me]; // opponent on top, you below

  function peg(seat: number, score: number, lane: number, back: boolean) {
    const { x, y } = pegXY(score, lane);
    // Bigger than a real peg so it reads at phone size.
    const r = back ? 3 : 3.8;
    return (
      <g
        key={`${seat}-${back ? "back" : "front"}`}
        style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 600ms ease" }}
        opacity={back ? 0.55 : 1}
      >
        <circle cx={1.1} cy={1.5} r={r} fill="#000" opacity={0.45} filter={ref("soft")} />
        <circle
          r={r}
          fill={seat === me ? ref("blue") : ref("red")}
          stroke="#1e0d04"
          strokeWidth={0.4}
        />
        <circle cx={-r * 0.35} cy={-r * 0.4} r={r * 0.32} fill="#fff" opacity={0.7} />
      </g>
    );
  }

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full drop-shadow-[0_14px_18px_rgba(0,0,0,0.6)]"
        role="img"
        aria-label={`Board: ${names[0]} ${scores[0]}, ${names[1]} ${scores[1]}`}
      >
        <defs>
          <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a4a1e" />
            <stop offset="0.5" stopColor="#64300f" />
            <stop offset="1" stopColor="#4a220c" />
          </linearGradient>
          <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd9a0" stopOpacity="0.55" />
            <stop offset="0.25" stopColor="#ffd9a0" stopOpacity="0.08" />
            <stop offset="0.8" stopColor="#000" stopOpacity="0.15" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </linearGradient>
          <radialGradient id={`${id}-lantern`} cx="0.72" cy="0" r="0.9">
            <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-drill`} cx="0.5" cy="0.35" r="0.6">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.7" stopColor="#140802" />
            <stop offset="1" stopColor="#3a1a08" />
          </radialGradient>
          <radialGradient id={`${id}-blue`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#d6e8ff" />
            <stop offset="0.45" stopColor={PEG_COLORS.me} />
            <stop offset="1" stopColor="#123f8f" />
          </radialGradient>
          <radialGradient id={`${id}-red`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#ffd0c8" />
            <stop offset="0.45" stopColor={PEG_COLORS.opponent} />
            <stop offset="1" stopColor="#7f1416" />
          </radialGradient>
          <filter id={`${id}-soft`} x="-1" y="-1" width="3" height="3">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
          <filter id={`${id}-inset`} x="-0.1" y="-0.5" width="1.2" height="2">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        {/* Wood, lit by a lantern above, with a lit bevel on top and shadow underneath. */}
        <rect width={W} height={H} rx={10} fill={ref("wood")} />
        <rect width={W} height={H} rx={10} fill={ref("lantern")} />
        <rect
          x={1}
          y={1}
          width={W - 2}
          height={H - 2}
          rx={9}
          fill="none"
          stroke={ref("bevel")}
          strokeWidth={2}
        />

        {[0, 1].map((lane) => {
          const r = laneRect(lane);
          return (
            <g key={lane}>
              {/* Recessed channel: darker floor, shadowed top lip, lit bottom lip. */}
              <rect {...r} fill="#2a1206" opacity={0.42} />
              <rect
                {...r}
                fill="none"
                stroke="#120700"
                strokeOpacity={0.55}
                strokeWidth={1.2}
                filter={ref("inset")}
              />
              <line
                x1={r.x + 4}
                y1={r.y + r.height + 0.8}
                x2={r.x + r.width - 4}
                y2={r.y + r.height + 0.8}
                stroke="#ffcf9a"
                strokeOpacity={0.22}
              />
            </g>
          );
        })}
        <line x1={10} y1={46} x2={W - 10} y2={46} stroke="#1e0d04" strokeOpacity={0.35} />

        {lanes.map((seat, lane) => (
          <g key={seat}>
            {Array.from({ length: 120 }, (_, k) => {
              const n = k + 1;
              const { x, y } = holeXY(n, lane);
              const treasure = pirate?.treasure && TREASURE_HOLES.includes(n);
              const kraken = pirate?.kraken && KRAKEN_HOLES.includes(n);
              return (
                <g key={n}>
                  {/* Drilled hole: dark depth, a lit lower rim. */}
                  <circle cx={x} cy={y} r={1.65} fill="#f0b47a" opacity={0.18} />
                  <circle cx={x} cy={y - 0.25} r={1.5} fill={ref("drill")} />
                  {treasure && (
                    <text x={x} y={y + 1.6} fontSize="5" textAnchor="middle" fill="#f2b84b">
                      ✕
                    </text>
                  )}
                  {kraken && (
                    <circle cx={x} cy={y} r={2.5} fill="none" stroke="#3fb6c9" strokeWidth={0.8} />
                  )}
                </g>
              );
            })}
          </g>
        ))}
        {/* Pegs last, so they sit above every hole. */}
        {lanes.map((seat, lane) => peg(seat, backPegs[seat as 0 | 1], lane, true))}
        {lanes.map((seat, lane) => peg(seat, scores[seat as 0 | 1], lane, false))}
      </svg>
      {pirate && (pirate.treasure || pirate.kraken) && (
        <figcaption className="mt-1 text-center text-[11px] text-parchment/70">
          {pirate.treasure && (
            <span className="mr-3">
              <span className="text-gold">✕</span> treasure +3
            </span>
          )}
          {pirate.kraken && (
            <span>
              <span className="text-[#3fb6c9]">◯</span> kraken −4
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
