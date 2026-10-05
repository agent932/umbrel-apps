import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "./useDismiss.js";
import { type Settings, updateSettings, useSettings } from "../settings.js";
import wheelUrl from "../assets/ui/icon-wheel.webp";

/** The ship's wheel in the corner: sound on/off and how fast Cap'n Bot plays. Saved in this browser. */
export function SettingsButton() {
  // Where the panel drops from: under the wheel, wherever the wheel sits on the page.
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = at !== null;
  function toggle() {
    const r = button.current?.getBoundingClientRect();
    setAt(open || !r ? null : { top: r.bottom + 8, right: r.right });
  }
  return (
    <span className="relative">
      <button
        ref={button}
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        className="opacity-85 transition hover:scale-110 hover:opacity-100"
        onClick={toggle}
      >
        <img src={wheelUrl} alt="" className="h-7 w-7" />
      </button>
      {at &&
        createPortal(
          <SettingsPanel at={at} opener={button} onClose={() => setAt(null)} />,
          document.body,
        )}
    </span>
  );
}

/**
 * The settings, dropped from the wheel: lined up with the wheel's right edge, but never past
 * either side of the screen or its safe areas, and scrolling if the screen is short.
 */
function SettingsPanel({
  at,
  opener,
  onClose,
}: {
  at: { top: number; right: number };
  opener: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(panel, opener, onClose);
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Settings"
      className="float-panel settings-panel rounded-xl border border-gold/40 bg-sea p-3 text-left text-sm text-parchment shadow-2xl"
      style={
        {
          top: at.top,
          "--panel-top": `${at.top}px`,
          "--at-right": `${at.right}px`,
        } as React.CSSProperties
      }
    >
      <SettingsFields />
      <button
        type="button"
        className="mt-3 w-full text-xs text-parchment/60 hover:text-gold"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  );
}

/** Sound, Peggy, animations and Cap'n Bot's speed. Saved in this browser. */
export function SettingsFields() {
  const settings = useSettings();
  return (
    <>
      <label className="flex items-center justify-between gap-2">
        Sound effects
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) => updateSettings({ sound: e.target.checked })}
          className="accent-[var(--color-gold)]"
        />
      </label>
      <label className="mt-2 flex items-center justify-between gap-2">
        Peggy's commentary
        <input
          type="checkbox"
          checked={settings.peggy}
          onChange={(e) => updateSettings({ peggy: e.target.checked })}
          className="accent-[var(--color-gold)]"
        />
      </label>
      <label className="mt-2 flex items-center justify-between gap-2">
        Pirate animations
        <input
          type="checkbox"
          checked={settings.animations}
          onChange={(e) => updateSettings({ animations: e.target.checked })}
          className="accent-[var(--color-gold)]"
        />
      </label>
      <fieldset className="mt-3">
        <legend className="mb-1 text-parchment/70">Cap'n Bot's speed</legend>
        <div className="flex gap-1">
          {(["slow", "normal", "fast"] as Settings["speed"][]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={settings.speed === s}
              onClick={() => updateSettings({ speed: s })}
              className={`flex-1 rounded-lg border px-2 py-1 capitalize ${settings.speed === s ? "border-gold bg-gold/20" : "border-parchment/25"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
