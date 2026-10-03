import { useState } from "react";
import { type Settings, updateSettings, useSettings } from "../settings.js";

/** ⚙️ in the corner: sound on/off and how fast Cap'n Bot plays. Saved in this browser. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        className="text-parchment/70 hover:text-gold"
        onClick={() => setOpen((o) => !o)}
      >
        ⚙️
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-gold/40 bg-sea p-3 text-left text-sm text-parchment shadow-2xl"
        >
          <SettingsFields />
          <button
            type="button"
            className="mt-3 w-full text-xs text-parchment/60 hover:text-gold"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </span>
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
