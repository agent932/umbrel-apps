import { useId } from "react";
import { KRAKEN_HOLES, TREASURE_HOLES, type RuleSet } from "@pirate/engine";
import boardUrl from "../../assets/table/board.webp";
import { PEG_COLORS } from "../../brand/powerArt.js";

interface PaintedBoardProps {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  /** Your seat: your pegs are blue and run down the right-hand channel. */
  me: 0 | 1;
  /** Upright down the side of a landscape table, or lying across a portrait one. */
  upright: boolean;
}

// Measured on board.webp (700 x 1400): the two carved channels and the run of holes along them.
const ART_W = 700;
const ART_H = 1400;
const LANE_X = [238, 460];
const COL_OFF = 36;
const TOP = 210;
const BOTTOM = 1190;

/** Hole n (1..120) in board-art pixels: up one column (1-60), back down the other (61-120). */
function holeUV(n: number, lane: number): [number, number] {
  const row = n <= 60 ? 0 : 1;
  const i = row === 0 ? n - 1 : 120 - n;
  return [
    LANE_X[lane]! + (row === 0 ? -COL_OFF : COL_OFF),
    BOTTOM - (i * 15 + Math.floor(i / 5) * 8),
  ];
}

function pegUV(score: number, lane: number): [number, number] {
  if (score <= 0) return [LANE_X[lane]!, BOTTOM + 32];
  if (score >= 121) return [LANE_X[lane]!, TOP - 30];
  return holeUV(score, lane);
}

/** The painted cribbage board, with 121 holes per player drilled into its carved channels. */
export function PaintedBoard({ scores, backPegs, rules, names, me, upright }: PaintedBoardProps) {
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  // Portrait lays the board on its side, start on the right.
  const at = ([u, v]: [number, number]): [number, number] => (upright ? [u, v] : [v, ART_W - u]);
  const lanes = [1 - me, me]; // opponent in the left channel, you in the right
  const pirate = rules.pirate;

  function peg(seat: number, score: number, lane: number, back: boolean) {
    const [x, y] = at(pegUV(score, lane));
    const r = back ? 10 : 12.5;
    return (
      <g
        key={`${seat}-${back ? "back" : "front"}`}
        style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 600ms ease" }}
        opacity={back ? 0.6 : 1}
      >
        <circle cx={3.5} cy={5} r={r} fill="#000" opacity={0.45} />
        <circle
          r={r}
          fill={seat === me ? ref("blue") : ref("red")}
          stroke="#1e0d04"
          strokeWidth={1.3}
        />
        <circle cx={-r * 0.35} cy={-r * 0.4} r={r * 0.32} fill="#fff" opacity={0.7} />
      </g>
    );
  }

  return (
    <svg
      viewBox={upright ? `0 0 ${ART_W} ${ART_H}` : `0 0 ${ART_H} ${ART_W}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.6)]"
      role="img"
      aria-label={`Board: ${names[0]} ${scores[0]}, ${names[1]} ${scores[1]}`}
    >
      <defs>
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
      </defs>
      <image
        href={boardUrl}
        width={ART_W}
        height={ART_H}
        transform={upright ? undefined : `translate(0 ${ART_W}) rotate(-90)`}
      />
      {lanes.map((seat, lane) => (
        <g key={seat}>
          {Array.from({ length: 120 }, (_, k) => {
            const n = k + 1;
            const [x, y] = at(holeUV(n, lane));
            const treasure = pirate?.treasure && TREASURE_HOLES.includes(n);
            const kraken = pirate?.kraken && KRAKEN_HOLES.includes(n);
            return (
              <g key={n}>
                <circle cx={x} cy={y + 1.5} r={5.4} fill="#f0b47a" opacity={0.22} />
                <circle cx={x} cy={y} r={5} fill={ref("drill")} />
                {treasure && (
                  <text
                    x={x}
                    y={y + 7}
                    fontSize="20"
                    fontWeight="900"
                    textAnchor="middle"
                    fill="#f2b84b"
                  >
                    ✕
                  </text>
                )}
                {kraken && (
                  <circle cx={x} cy={y} r={10} fill="none" stroke="#3fb6c9" strokeWidth={3} />
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
  );
}
