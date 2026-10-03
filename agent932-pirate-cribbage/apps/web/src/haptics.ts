import { getSettings } from "./settings.js";

/** A short buzz on phones that support it (Android). Off with animations or reduced motion. */
export function buzz(ms = 12) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (!getSettings().animations) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  navigator.vibrate(ms);
}
