import { useState } from "react";
import {
  type BotLevel,
  CLASSIC_RULES,
  PIRATE_RULES,
  POWER_INFO,
  POWERS,
  type RuleSet,
} from "@pirate/engine";
import { POWER_ICONS } from "../components/PowerBar.js";
import type { LocalGameOptions } from "../game/localGame.js";

interface Props {
  canResume: boolean;
  onResume: () => void;
  onStart: (options: LocalGameOptions) => void;
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; note?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm text-parchment/70">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-xl border px-3 py-2 text-center transition has-[:checked]:border-gold has-[:checked]:bg-gold/15 ${
              o.disabled
                ? "cursor-not-allowed opacity-40"
                : "border-parchment/25 hover:border-gold/60"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={label}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
            />
            <span className="block font-semibold">{o.label}</span>
            {o.note && <span className="block text-xs text-parchment/60">{o.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function HomeScreen({ canResume, onResume, onStart }: Props) {
  const [level, setLevel] = useState<BotLevel | "hard">("medium");
  const [mode, setMode] = useState<"classic" | "pirate">("pirate");
  const [cost, setCost] = useState<"free" | "plunder">("free");

  function start() {
    const rules: RuleSet =
      mode === "classic"
        ? CLASSIC_RULES
        : {
            ...PIRATE_RULES,
            pirate: { ...PIRATE_RULES.pirate!, powerCost: cost === "plunder" ? 2 : 0 },
          };
    onStart({ level: level as BotLevel, rules });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="font-pirate text-5xl text-gold sm:text-6xl">Pirate Cribbage</h1>
        <p className="mt-2 text-parchment/80">
          Fifteen-two, fifteen-four, and a pair be six, matey.
        </p>
      </header>

      {canResume && (
        <button type="button" className="btn-secondary" onClick={onResume}>
          Resume yer game
        </button>
      )}

      <section className="flex flex-col gap-5 rounded-2xl border border-gold/30 bg-sea-deep/60 p-5">
        <h2 className="font-pirate text-2xl text-gold">Play vs Cap'n Bot</h2>
        <Choice
          label="Opponent"
          value={level}
          onChange={setLevel}
          options={[
            { value: "easy", label: "Easy", note: "Deckhand" },
            { value: "medium", label: "Medium", note: "Bosun" },
            { value: "hard", label: "Hard", note: "Coming soon", disabled: true },
          ]}
        />
        <Choice
          label="Rules"
          value={mode}
          onChange={setMode}
          options={[
            { value: "classic", label: "Classic", note: "Straight cribbage" },
            { value: "pirate", label: "Pirate", note: "Twists & powers" },
          ]}
        />
        {mode === "pirate" && (
          <>
            <Choice
              label="Powers"
              value={cost}
              onChange={setCost}
              options={[
                { value: "free", label: "Free", note: "Once each per game" },
                { value: "plunder", label: "Plunder", note: "Each costs 2 points" },
              ]}
            />
            <details className="text-sm text-parchment/80">
              <summary className="cursor-pointer text-parchment">
                What are the pirate rules?
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                <li>
                  ✕ <b>Buried Treasure:</b> land exactly on hole 30, 60 or 90 for +3.
                </li>
                <li>
                  ◯ <b>The Kraken:</b> land exactly on hole 45, 75 or 105 and get dragged back 4.
                </li>
                <li>
                  🂡 <b>The Black Spot:</b> if the Ace of Spades is cut, the pone steals the crib.
                </li>
                {POWERS.map((p) => (
                  <li key={p}>
                    {POWER_ICONS[p]} <b>{POWER_INFO[p].name}:</b> {POWER_INFO[p].description}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <button type="button" className="btn-primary" onClick={start}>
          Set sail ⛵
        </button>
      </section>

      <p className="text-center text-xs text-parchment/50">
        Online play, accounts and stats are on the horizon.
      </p>
    </main>
  );
}
