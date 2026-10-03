import { KRAKEN_HOLES, TREASURE_HOLES, type RuleSet } from "@pirate/engine";

interface BoardProps {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  /** Your seat: your lane is drawn at the bottom, in gold. */
  me?: 0 | 1;
}

const HOLES_PER_ROW = 60;
const GAP = 5.6;
const X0 = 14;
/** Peg fills: brass for you, coral for your opponent (gradients defined in the SVG). */
const PEG = ["url(#peg-brass)", "url(#peg-coral)"];

/** Hole n (1..120) → position. Each player has two lanes: 1–60 left to right, 61–120 back. */
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

export function Board({ scores, backPegs, rules, names, me = 0 }: BoardProps) {
  const pirate = rules.pirate;
  const lanes = [1 - me, me]; // opponent on top, you below
  const color = (seat: number) => (seat === me ? PEG[0] : PEG[1]);
  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 400 92"
        className="w-full rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)]"
        role="img"
        aria-label={`Board: ${names[0]} ${scores[0]}, ${names[1]} ${scores[1]}`}
      >
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7a3d17" />
            <stop offset="0.5" stopColor="#5e2c10" />
            <stop offset="1" stopColor="#4a220c" />
          </linearGradient>
          <radialGradient id="lantern" cx="0.72" cy="0" r="0.9">
            <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="peg-brass" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#fff1c2" />
            <stop offset="0.45" stopColor="#f2b84b" />
            <stop offset="1" stopColor="#9a6a17" />
          </radialGradient>
          <radialGradient id="peg-coral" cx="0.35" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#ffd0c8" />
            <stop offset="0.45" stopColor="#e05252" />
            <stop offset="1" stopColor="#8f2626" />
          </radialGradient>
        </defs>
        {/* Wood, lit by a lantern above, with a carved border. */}
        <rect width="400" height="92" rx="10" fill="url(#wood)" />
        <rect width="400" height="92" rx="10" fill="url(#lantern)" />
        <rect
          x="3"
          y="3"
          width="394"
          height="86"
          rx="8"
          fill="none"
          stroke="#2e1406"
          strokeOpacity="0.55"
        />
        <rect
          x="4.5"
          y="4.5"
          width="391"
          height="83"
          rx="7"
          fill="none"
          stroke="#c9962c"
          strokeOpacity="0.3"
        />
        <line x1="10" y1="46" x2="390" y2="46" stroke="#2e1406" strokeOpacity="0.4" />
        {lanes.map((seat, lane) => (
          <g key={seat}>
            {Array.from({ length: 120 }, (_, k) => {
              const n = k + 1;
              const { x, y } = holeXY(n, lane);
              const treasure = pirate?.treasure && TREASURE_HOLES.includes(n);
              const kraken = pirate?.kraken && KRAKEN_HOLES.includes(n);
              return (
                <g key={n}>
                  <circle cx={x} cy={y + 0.3} r={1.5} fill="#8a4a1f" opacity={0.5} />
                  <circle cx={x} cy={y} r={1.45} fill="#1e0d04" />
                  {treasure && (
                    <text x={x} y={y + 1.6} fontSize="5" textAnchor="middle" fill="#f2b84b">
                      ✕
                    </text>
                  )}
                  {kraken && (
                    <circle cx={x} cy={y} r={2.4} fill="none" stroke="#3fb6c9" strokeWidth={0.8} />
                  )}
                </g>
              );
            })}
            <circle
              cx={pegXY(backPegs[seat as 0 | 1], lane).x}
              cy={pegXY(backPegs[seat as 0 | 1], lane).y}
              r={2.8}
              fill={color(seat)}
              opacity={0.5}
            />
            <circle
              cx={pegXY(scores[seat as 0 | 1], lane).x}
              cy={pegXY(scores[seat as 0 | 1], lane).y}
              r={3.4}
              fill={color(seat)}
              stroke="#1e0d04"
              strokeWidth={0.5}
              style={{ transition: "cx 600ms ease, cy 600ms ease" }}
            />
          </g>
        ))}
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
