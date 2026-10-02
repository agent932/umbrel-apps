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
const COLORS = ["var(--color-gold)", "#e05252"];

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
  const color = (seat: number) => (seat === me ? COLORS[0] : COLORS[1]);
  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 400 92"
        className="w-full rounded-xl border border-rum bg-[#5b2c0f] shadow-inner"
        role="img"
        aria-label={`Board: ${names[0]} ${scores[0]}, ${names[1]} ${scores[1]}`}
      >
        {lanes.map((seat, lane) => (
          <g key={seat}>
            {Array.from({ length: 120 }, (_, k) => {
              const n = k + 1;
              const { x, y } = holeXY(n, lane);
              const treasure = pirate?.treasure && TREASURE_HOLES.includes(n);
              const kraken = pirate?.kraken && KRAKEN_HOLES.includes(n);
              return (
                <g key={n}>
                  <circle cx={x} cy={y} r={1.5} fill="#2a1406" />
                  {treasure && (
                    <text
                      x={x}
                      y={y + 1.6}
                      fontSize="5"
                      textAnchor="middle"
                      fill="var(--color-gold)"
                    >
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
              stroke="#000"
              strokeWidth={0.6}
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
