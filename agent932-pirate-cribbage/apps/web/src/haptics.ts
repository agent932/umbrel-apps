import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { isNativeApp } from "./native.js";
import { getSettings } from "./settings.js";

/** A short buzz: the Taptic Engine in the iPhone app, vibrate() on Android. Off with animations or reduced motion. */
export function buzz(ms = 12) {
  if (typeof navigator === "undefined") return;
  if (!getSettings().animations) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (isNativeApp) {
    void Haptics.impact({ style: ms >= 20 ? ImpactStyle.Medium : ImpactStyle.Light });
    return;
  }
  navigator.vibrate?.(ms);
}
