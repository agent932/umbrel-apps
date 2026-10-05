import { useEffect, useId, useState } from "react";
import { KRAKEN_HOLES, TREASURE_HOLES, type RuleSet } from "@pirate/engine";
import { type HolePoint, getBoardSkin, holePoint } from "../../brand/boardSkins.js";
import { PEG_COLORS } from "../../brand/powerArt.js";
import { pegTick } from "../../sound.js";

interface PaintedBoardProps {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  /** Your seat: your pegs are blue and run down the right-hand channel. */
  me: 0 | 1;
  /** Upright down the side of a landscape table, or lying across a portrait one. */
  upright: boolean;
  /** Jump straight to new scores instead of hopping hole by hole (tests). */
  instant?: boolean;
  /** Which board skin to draw (an unknown one falls back to the default board). */
  skinId?: string;
}

const LANES = [0, 1] as const;

/** How long a peg takes to hop one hole. */
const STEP_MS = 80;

/** The score a peg shows: it walks hole by hole to the real score, tapping each hole. */
function useHopping(target: number, instant: boolean) {
  const [shown, setShown] = useState(target);
  useEffect(() => {
    if (instant || shown === target) return;
    const t = setTimeout(() => {
      setShown((s) => s + Math.sign(target - s));
      pegTick();
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [shown, target, instant]);
  return instant ? target : shown;
}

/** The painted cribbage board: each player's lane of holes (from the skin's hole map) and pegs. */
export function PaintedBoard({
  scores,
  backPegs,
  rules,
  names,
  me,
  upright,
  instant = false,
  skinId,
}: PaintedBoardProps) {
  const skin = getBoardSkin(skinId);
  const layout = skin.upright;
  const [artW, artH] = layout.size;
  const holeR = layout.holeRadius * artW;
  const pegR = layout.pegRadius * artW;
  const hopping: [number, number] = [
    useHopping(scores[0], instant),
    useHopping(scores[1], instant),
  ];
  const id = useId().replace(/:/g, "");
  const ref = (name: string) => `url(#${id}-${name})`;
  // Portrait lays the board on its side, start on the right.
  const at = ([u, v]: HolePoint): HolePoint => (upright ? [u, v] : [v, artW - u]);
  // The opponent's pegs run in the left lane, yours in the right.
  const seatIn = (lane: 0 | 1): 0 | 1 => (lane === 1 ? me : me === 0 ? 1 : 0);
  const pirate = rules.pirate;

  const sprite = layout.pegSprite;

  function peg(seat: number, score: number, lane: 0 | 1, back: boolean) {
    const [x, y] = at(holePoint(layout, lane, score));
    const r = back ? pegR * 0.8 : pegR;
    const mine = seat === me;
    if (sprite && skin.pegUrls) {
      // A standing peg, upright on screen whichever way the board lies, its tip in the hole.
      const h = sprite.height * artW * (back ? 0.8 : 1);
      const w = (h * sprite.size[0]) / sprite.size[1];
      return (
        <g
          key={`${seat}-${back ? "back" : "front"}-${upright}`}
          data-peg={`${mine ? "me" : "opponent"}-${back ? "back" : "front"}`}
          style={{
            transform: `translate(${x}px, ${y}px)`,
            transition: `transform ${back ? 400 : STEP_MS}ms ease-out`,
          }}
          opacity={back ? 0.8 : 1}
        >
          {/* Its shadow falls down and to the right, across the board. */}
          <ellipse
            cx={w * 0.35}
            cy={holeR * 0.3}
            rx={w * 0.55}
            ry={holeR * 0.75}
            fill="#000"
            opacity={0.45}
          />
          <image
            href={mine ? skin.pegUrls.me : skin.pegUrls.opponent}
            x={-w / 2}
            y={-h + holeR * 0.4}
            width={w}
            height={h}
            style={back ? { filter: "brightness(0.65)" } : undefined}
          />
        </g>
      );
    }
    return (
      <g
        // Keyed by orientation too, so turning the device moves pegs at once rather than sliding.
        key={`${seat}-${back ? "back" : "front"}-${upright}`}
        data-peg={`${mine ? "me" : "opponent"}-${back ? "back" : "front"}`}
        style={{
          transform: `translate(${x}px, ${y}px)`,
          transition: `transform ${back ? 400 : STEP_MS}ms ease-out`,
        }}
        opacity={back ? 0.6 : 1}
      >
        <circle cx={3.5} cy={5} r={r} fill="#000" opacity={0.45} />
        <circle r={r} fill={mine ? ref("blue") : ref("red")} stroke="#1e0d04" strokeWidth={1.3} />
        <circle cx={-r * 0.35} cy={-r * 0.4} r={r * 0.32} fill="#fff" opacity={0.7} />
      </g>
    );
  }

  return (
    <svg
      viewBox={upright ? `0 0 ${artW} ${artH}` : `0 0 ${artH} ${artW}`}
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
        href={skin.imageUrl}
        width={artW}
        height={artH}
        transform={upright ? undefined : `translate(0 ${artW}) rotate(-90)`}
      />
      {LANES.map((lane) => (
        <g key={lane}>
          {layout.lanes[lane].holes.map((_, n) => {
            // A shared game hole is drawn once.
            if (n === 121 && lane === 1 && layout.sharedGameHole) return null;
            const [x, y] = at(holePoint(layout, lane, n));
            const treasure = pirate?.treasure && TREASURE_HOLES.includes(n);
            const kraken = pirate?.kraken && KRAKEN_HOLES.includes(n);
            // The game hole is bigger, with a brass ring.
            const r = n === 121 ? holeR * 1.6 : holeR;
            return (
              <g key={n}>
                <circle cx={x} cy={y + 1.5} r={r * 1.08} fill="#f0b47a" opacity={0.22} />
                <circle cx={x} cy={y} r={r} fill={ref("drill")} />
                {n === 121 && (
                  <circle cx={x} cy={y} r={r + 3} fill="none" stroke="#f2b84b" strokeWidth={2} />
                )}
                {treasure && (
                  <text
                    x={x}
                    y={y + holeR * 1.4}
                    fontSize={holeR * 4}
                    fontWeight="900"
                    textAnchor="middle"
                    fill="#f2b84b"
                  >
                    ✕
                  </text>
                )}
                {kraken && (
                  <circle
                    cx={x}
                    cy={y}
                    r={holeR * 2}
                    fill="none"
                    stroke="#3fb6c9"
                    strokeWidth={holeR * 0.6}
                  />
                )}
              </g>
            );
          })}
        </g>
      ))}
      {/* Pegs last, so they sit above every hole. */}
      {LANES.map((lane) => peg(seatIn(lane), backPegs[seatIn(lane)], lane, true))}
      {LANES.map((lane) => peg(seatIn(lane), hopping[seatIn(lane)], lane, false))}
    </svg>
  );
}
