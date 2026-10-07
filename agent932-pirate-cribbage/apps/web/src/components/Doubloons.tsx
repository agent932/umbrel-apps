import { useId } from "react";
import { Link } from "wouter";
import type { BotLevel, Reward } from "@pirate/engine";
import { achievementName, lineLabel, noteText } from "../economy.js";
import { achievementArt } from "./Achievements.js";

/** A gold doubloon, struck with a cross like old Spanish gold. Decoration only: say "doubloons" in text. */
export function DoubloonIcon({ className = "h-5 w-5" }: { className?: string }) {
  // Each coin needs its own gradient id (ids from useId can hold characters url() dislikes).
  const id = `coin${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffe6a3" />
          <stop offset="0.55" stopColor="#f2b84b" />
          <stop offset="1" stopColor="#b97a1c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.6" fill={`url(#${id})`} stroke="#7a5512" strokeWidth="1.2" />
      <circle
        cx="12"
        cy="12"
        r="7.8"
        fill="none"
        stroke="#9a6a16"
        strokeWidth="0.9"
        strokeDasharray="1.3 1.1"
      />
      <path d="M12 7.6v8.8M7.6 12h8.8" stroke="#8a5d12" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What a finished game or daily puzzle paid: "+145 doubloons", a line for each payment, every
 * achievement it unlocked (with what each paid), and why a win paid nothing or half.
 * Renders nothing when there's nothing to say (a loss with no achievements).
 */
export function RewardSummary({
  reward,
  level,
  oppName = "your opponent",
  className = "",
}: {
  reward: Reward;
  /** The computer's level, to name who you beat. */
  level?: BotLevel | null;
  oppName?: string;
  className?: string;
}) {
  const lines = reward.lines.filter((l) => l.reason !== "achievement");
  const paidFor = new Map(
    reward.lines.filter((l) => l.reason === "achievement").map((l) => [l.key, l.delta]),
  );
  if (reward.total === 0 && !reward.note && reward.unlocked.length === 0) return null;
  return (
    <div role="status" className={`flex flex-col gap-2 ${className}`}>
      {reward.total > 0 && (
        <p className="flex items-center justify-center gap-2 text-gold lantern-glow">
          <DoubloonIcon className="h-7 w-7 shrink-0" />
          <span className="num text-2xl">+{reward.total.toLocaleString()}</span>{" "}
          <span className="font-pirate text-2xl">doubloons</span>
        </p>
      )}
      {lines.length > 0 && (
        <ul className="mx-auto w-full max-w-xs text-sm" aria-label="Doubloons earned">
          {lines.map((l) => (
            <li
              key={l.reason}
              className="flex justify-between gap-3 border-b border-parchment/10 py-0.5 last:border-0"
            >
              <span>{lineLabel(l, level)}</span>{" "}
              <span className="num text-gold">+{l.delta.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {reward.unlocked.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="New achievements">
          {reward.unlocked.map((key) => {
            const paid = paidFor.get(key);
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/15 p-2 text-left"
                style={{ animation: "pop-in 300ms ease-out" }}
              >
                <img src={achievementArt(key)} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <span className="flex-1 text-sm">
                  <b className="text-gold">New achievement:</b> {achievementName(key)}
                </span>{" "}
                {paid !== undefined && (
                  <span className="num text-gold">+{paid.toLocaleString()}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {reward.note && (
        <p className="text-center text-sm text-parchment/80">{noteText(reward.note, oppName)}</p>
      )}
    </div>
  );
}

/**
 * For guests, where a signed-in player would see doubloons: a link to sign in. With an amount it
 * names what this win would have paid.
 */
export function EarnHint({
  amount,
  className = "",
  children,
}: {
  amount?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <p className={`text-center ${className}`}>
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-xl border border-gold/50 px-3 py-1.5 text-left text-sm text-gold hover:bg-gold/10"
      >
        <DoubloonIcon className="h-4 w-4 shrink-0" />
        {children ??
          (amount
            ? `Sign in to earn ${amount} doubloons for wins like this`
            : "Sign in to earn doubloons")}
      </Link>
    </p>
  );
}
