import { useEffect, useRef, useState } from "react";
import { buzz } from "../../haptics.js";

interface HandSlotProps {
  /** Position in the fan. */
  i: number;
  n: number;
  selected: boolean;
  /** Your turn to peg and this card fits under 31: it nudges to invite a play. */
  playable: boolean;
  /** Your turn to peg but this card would go past 31: it shakes when touched. */
  tooHigh: boolean;
  /** Tapping or flicking the card up does this (play it, or pick it for the crib). */
  onFlick?: () => void;
  children: React.ReactNode;
}

/** How far up (px) a card has to be dragged to count as a flick. */
const FLICK_PX = 40;

/**
 * One card in your fanned hand. Tap it, or drag it upward and let go to play it. It deals in from
 * the deck when it first appears (see `.t-deal-in`).
 */
export function HandSlot({ i, n, selected, playable, tooHigh, onFlick, children }: HandSlotProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [shaking, setShaking] = useState(false);
  // A flick ends with a click on the card; that click mustn't act a second time.
  const swallowClick = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  function onPointerDown(e: React.PointerEvent) {
    if (tooHigh) {
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
      return;
    }
    if (!onFlick || e.button !== 0) return;
    const startY = e.clientY;
    let lift = 0;
    const el = slot.current;
    const move = (ev: PointerEvent) => {
      lift = Math.min(0, ev.clientY - startY);
      if (lift < -6 && el) {
        el.classList.add("dragging");
        el.style.setProperty("--lift", `${lift}px`);
      }
    };
    const up = (ev: PointerEvent) => {
      // Measured again here: a quick flick may not report any moves in between.
      lift = Math.min(lift, ev.clientY - startY);
      stop.current?.();
      if (el) {
        el.classList.remove("dragging");
        el.style.removeProperty("--lift");
      }
      if (lift <= -FLICK_PX) {
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 400);
        buzz();
        onFlick();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      stop.current = null;
    };
  }

  return (
    <div
      ref={slot}
      className={`t-slot ${selected ? "sel" : ""} ${playable ? "playable" : ""} ${tooHigh ? "too-high" : ""}`}
      style={{ "--i": i, "--n": n } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <div className={`t-deal-in ${shaking ? "t-shake" : ""}`}>{children}</div>
    </div>
  );
}
