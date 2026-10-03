/**
 * The backdrop behind every page: night sky, twinkling stars, a glowing moon and slow waves.
 * Purely decorative (hidden from screen readers, ignores clicks). Motion stops for people who
 * prefer reduced motion (see index.css).
 */

// Fixed star positions (percent of the viewport), so the sky doesn't change between visits.
const STARS = [
  [6, 8, 1.2],
  [14, 22, 0.8],
  [22, 5, 1],
  [31, 16, 0.7],
  [38, 9, 1.3],
  [47, 24, 0.8],
  [55, 6, 1],
  [63, 18, 0.7],
  [71, 4, 1.1],
  [79, 27, 0.9],
  [88, 12, 1.2],
  [94, 30, 0.8],
  [9, 35, 0.9],
  [19, 44, 0.7],
  [27, 31, 1],
  [43, 38, 0.7],
  [52, 46, 0.9],
  [60, 33, 0.8],
  [68, 42, 1],
  [83, 47, 0.7],
  [97, 7, 0.9],
  [3, 52, 0.8],
  [35, 55, 0.7],
  [75, 58, 0.8],
  [91, 55, 1],
] as const;

export function MoonlitScene() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_0%,#123a57_0%,#0b2a3a_40%,#061a25_75%,#04121c_100%)]" />

      {STARS.map(([x, y, size], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-moon"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: size * 2.2,
            height: size * 2.2,
            opacity: 0.6,
            animation:
              i % 3 === 0 ? `twinkle ${3 + (i % 5)}s ease-in-out ${i * 0.37}s infinite` : undefined,
          }}
        />
      ))}

      {/* Moon with a soft halo, upper right. On phones it's smaller and sits between the
          opponent's name and score, so it never sits behind text. */}
      <div className="absolute top-[7vh] right-[30%] h-[20vw] w-[20vw] sm:top-[6vh] sm:right-[8vw] sm:h-[min(28vw,180px)] sm:w-[min(28vw,180px)]">
        <div className="absolute -inset-[60%] rounded-full bg-[radial-gradient(closest-side,rgba(255,246,216,0.28),transparent)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fffbea,#f4ecd2_55%,#d9cfae)] shadow-[0_0_60px_rgba(255,246,216,0.35)]" />
        <div className="absolute top-[28%] left-[30%] h-[14%] w-[14%] rounded-full bg-[#e3d8b6] opacity-70" />
        <div className="absolute top-[58%] left-[56%] h-[10%] w-[10%] rounded-full bg-[#e3d8b6] opacity-70" />
        <div className="absolute top-[22%] left-[62%] h-[7%] w-[7%] rounded-full bg-[#e3d8b6] opacity-70" />
      </div>

      {/* Waves: three layers drifting at different speeds. Each SVG is two tiles wide and slides by one tile. */}
      {[
        { bottom: "0", height: 120, color: "#0b3a52", duration: 38, opacity: 0.55 },
        { bottom: "0", height: 90, color: "#082c40", duration: 26, opacity: 0.75 },
        { bottom: "0", height: 60, color: "#05202f", duration: 18, opacity: 0.95 },
      ].map((w, i) => (
        <svg
          key={i}
          className="absolute left-0 w-[200%]"
          style={{
            bottom: w.bottom,
            height: w.height,
            opacity: w.opacity,
            animation: `drift ${w.duration}s linear infinite`,
          }}
          viewBox="0 0 1600 100"
          preserveAspectRatio="none"
        >
          <path
            d="M0 40 C 100 20, 200 60, 300 40 S 500 20, 600 40 S 700 60, 800 40 C 900 20, 1000 60, 1100 40 S 1300 20, 1400 40 S 1500 60, 1600 40 V 100 H 0 Z"
            fill={w.color}
          />
        </svg>
      ))}
    </div>
  );
}
