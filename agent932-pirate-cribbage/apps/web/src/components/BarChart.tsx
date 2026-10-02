import { useState } from "react";

/** Validated against the sea surface (dataviz lightness band + 3:1 contrast). */
const BAR = "#b8860b";

interface BarChartProps {
  title: string;
  labels: string[];
  values: number[];
  /** Tooltip / table text for one bar. */
  format: (value: number, i: number) => string;
  height?: number;
}

function niceMax(n: number) {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / p) * p;
}

/** Single-series column chart: thin bars from one baseline, a hover tooltip per bar, and a table view. */
export function BarChart({ title, labels, values, format, height = 140 }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(...values, 1));
  const W = 600;
  const H = height;
  const padL = 30;
  const padB = 18;
  const plotW = W - padL;
  const plotH = H - padB - 6;
  const slot = plotW / values.length;
  const barW = Math.min(24, slot - 2);
  const y = (v: number) => 6 + plotH - (v / top) * plotH;
  const ticks = [0, top / 2, top];
  const labelEvery = values.length > 15 ? 5 : 1;

  return (
    <figure className="relative">
      <figcaption className="mb-1 text-sm font-semibold">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={title}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W}
              y1={y(t)}
              y2={y(t)}
              stroke="rgba(243,229,192,0.12)"
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={y(t) + 4}
              fontSize="11"
              textAnchor="end"
              fill="rgba(243,229,192,0.6)"
            >
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(v));
          const r = Math.min(4, h);
          // Rounded data-end, square at the baseline.
          const d =
            h > 0
              ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + barW - r} Q${x + barW},${y(v)} ${x + barW},${y(v) + r} V${y(0)} Z`
              : "";
          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${labels[i]}: ${format(v, i)}`}
            >
              {/* Hit target spans the whole slot, taller than the mark. */}
              <rect x={padL + i * slot} y={6} width={slot} height={plotH} fill="transparent" />
              {d && <path d={d} fill={BAR} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {i % labelEvery === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 4}
                  fontSize="11"
                  textAnchor="middle"
                  fill="rgba(243,229,192,0.6)"
                >
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-6 rounded-md border border-parchment/20 bg-sea-deep px-2 py-1 text-xs shadow"
          style={{
            left: `clamp(0px, ${((padL + (hover + 0.5) * slot) / W) * 100}% - 40px, calc(100% - 110px))`,
          }}
        >
          <b>{labels[hover]}</b>: {format(values[hover]!, hover)}
        </div>
      )}
      <details className="mt-1 text-xs text-parchment/70">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-1 w-full">
          <tbody>
            {values.map((v, i) => (
              <tr key={i} className="border-t border-parchment/10">
                <td className="py-0.5">{labels[i]}</td>
                <td className="py-0.5 text-right tabular-nums">{format(v, i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
