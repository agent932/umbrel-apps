import { useLocation } from "wouter";

/**
 * The painted backdrop behind every page: the moonlit harbour on the title screen, a calm night
 * sea everywhere else (a landscape and a portrait painting each, picked in CSS). The game table
 * paints over it. Purely decorative (hidden from screen readers, ignores clicks).
 */
export function MoonlitScene() {
  const [location] = useLocation();
  const scene = location === "/" ? "harbour" : "sea";
  return (
    <div
      aria-hidden
      className={`backdrop backdrop-${scene} pointer-events-none fixed inset-0 -z-10`}
    >
      {/* Darkens the painting a little where text sits, so it always reads. */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_45%,rgba(4,18,28,0.55),rgba(4,18,28,0.15)_70%,transparent)]" />
    </div>
  );
}
