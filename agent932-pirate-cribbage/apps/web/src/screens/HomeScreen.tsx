import { useState } from "react";
import { type BotLevel, POWER_INFO, POWERS } from "@pirate/engine";
import { useAuth } from "../auth.js";
import { Peggy } from "../brand/Peggy.js";
import logoUrl from "../assets/ui/logo-a.webp";
import { BOT_CREW } from "../brand/botCrew.js";
import { POWER_ART } from "../brand/powerArt.js";
import { AccountBar } from "../components/AccountBar.js";
import type { MenuChoice } from "../game/menu.js";

interface Props {
  /** Start a practice game where Peggy explains each step. */
  onLearn: () => void;
  canResume: boolean;
  onResume: () => void;
  onStart: (choice: MenuChoice) => void;
  starting?: boolean;
  error?: string | null;
  /** Extra sections (the online lobby for signed-in players). */
  children?: React.ReactNode;
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; note?: string; image?: string; disabled?: boolean }[];
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
            {o.image && (
              <img
                src={o.image}
                alt=""
                className="mx-auto mb-1 h-12 w-12 rounded-full object-cover ring-2 ring-brass/70"
              />
            )}
            <span className="block font-semibold">{o.label}</span>
            {o.note && <span className="block text-xs text-parchment/60">{o.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function HomeScreen({
  canResume,
  onResume,
  onLearn,
  onStart,
  starting,
  error,
  children,
}: Props) {
  const { user } = useAuth();
  const [level, setLevel] = useState<BotLevel>("medium");
  const [mode, setMode] = useState<"classic" | "pirate">("pirate");
  const [cost, setCost] = useState<"free" | "plunder">("free");

  function start() {
    onStart({
      level,
      variant: mode,
      powerCost: mode === "pirate" && cost === "plunder" ? 2 : 0,
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-6">
      <AccountBar />
      <header className="flex flex-col items-center text-center">
        <Peggy bob className="mb-1 h-28 w-auto drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" />
        <h1>
          <img
            src={logoUrl}
            alt="Pirate Cribbage"
            className="mx-auto h-auto max-h-[30dvh] w-[min(88vw,460px)] object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]"
          />
        </h1>
        <p className="mt-2 text-parchment/80">
          Fifteen-two, fifteen-four, and a pair be six, matey.
        </p>
      </header>

      {canResume && (
        <button type="button" className="btn-secondary" onClick={onResume}>
          Resume yer game
        </button>
      )}
      <button type="button" className="btn-secondary" onClick={onLearn}>
        New to cribbage? Learn to play with Peggy
      </button>

      <section className="panel flex flex-col gap-5 p-5">
        <h2 className="font-pirate text-2xl text-gold">Play the crew</h2>
        <Choice
          label="Opponent"
          value={level}
          onChange={setLevel}
          options={[
            ...(["easy", "medium", "hard"] as const).map((l) => ({
              value: l,
              label: l[0]!.toUpperCase() + l.slice(1),
              note: BOT_CREW[l].name,
              image: BOT_CREW[l].portrait,
            })),
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
                    <img src={POWER_ART[p]} alt="" className="mr-1 inline h-5 w-5 align-[-5px]" />{" "}
                    <b>{POWER_INFO[p].name}:</b> {POWER_INFO[p].description}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary" onClick={start} disabled={starting}>
          Set sail
        </button>
        <p className="text-center text-xs text-parchment/60">
          {user
            ? "This game counts toward your Ship's Log."
            : "Playing as a guest: sign up to keep your stats."}
        </p>
      </section>

      {children}

      <p className="text-center text-xs text-parchment/50">Fair winds, matey.</p>
    </main>
  );
}
