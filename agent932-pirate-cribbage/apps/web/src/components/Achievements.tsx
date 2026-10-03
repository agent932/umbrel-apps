import { useEffect, useState } from "react";
import { ACHIEVEMENTS, type PowerId } from "@pirate/engine";
import { api } from "../api.js";
import { POWER_ART } from "../brand/powerArt.js";
import trophyUrl from "../assets/ui/icon-trophy.webp";
import flagUrl from "../assets/ui/icon-flag.webp";
import goldMedalUrl from "../assets/ui/medal-gold.webp";
import silverMedalUrl from "../assets/ui/medal-silver.webp";
import bronzeMedalUrl from "../assets/ui/medal-bronze.webp";
import goldTierUrl from "../assets/ui/tier-gold.webp";

interface Earned {
  key: string;
  unlockedAt: string;
}

const ART: Record<string, string> = {
  firstWin: trophyUrl,
  hand24: silverMedalUrl,
  hand29: goldMedalUrl,
  skunk: flagUrl,
  doubleSkunk: flagUrl,
  wins10: trophyUrl,
  streak5: bronzeMedalUrl,
  gold: goldTierUrl,
};

export const achievementArt = (key: string) =>
  key.startsWith("power:") ? POWER_ART[key.slice(6) as PowerId] : (ART[key] ?? trophyUrl);

async function fetchEarned(): Promise<Earned[] | null> {
  try {
    return (await api<{ achievements: Earned[] }>("/api/achievements")).achievements;
  } catch {
    return null; // signed out
  }
}

/** Every achievement, earned ones in colour with the date. For the Ship's Log. */
export function AchievementGrid() {
  const [earned, setEarned] = useState<Earned[] | null>(null);
  useEffect(() => {
    void fetchEarned().then(setEarned);
  }, []);
  if (!earned) return null;
  const when = new Map(earned.map((e) => [e.key, e.unlockedAt]));
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-labelledby="achievements-heading">
      <h2 id="achievements-heading" className="scroll-title !text-xl">
        Achievements · {earned.length}/{ACHIEVEMENTS.length}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ACHIEVEMENTS.map((a) => {
          const at = when.get(a.key);
          return (
            <li
              key={a.key}
              className={`flex items-center gap-3 rounded-xl border p-2 ${at ? "border-gold/50 bg-gold/10" : "border-parchment/15 opacity-60"}`}
            >
              <img
                src={achievementArt(a.key)}
                alt=""
                className={`h-11 w-11 shrink-0 object-contain ${at ? "" : "grayscale"}`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{a.name}</span>
                <span className="block text-xs text-parchment/75">
                  {at ? `Earned ${new Date(at).toLocaleDateString()}` : a.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** At game over: anything earned in the last few minutes. Nothing for guests. */
export function NewAchievements() {
  const [fresh, setFresh] = useState<Earned[]>([]);
  useEffect(() => {
    const since = Date.now() - 3 * 60_000;
    // The server records the match as the game ends; give it a moment.
    const t = setTimeout(() => {
      void fetchEarned().then((all) =>
        setFresh((all ?? []).filter((e) => new Date(e.unlockedAt).getTime() >= since)),
      );
    }, 900);
    return () => clearTimeout(t);
  }, []);
  if (!fresh.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5" aria-label="New achievements">
      {fresh.map((e) => {
        const a = ACHIEVEMENTS.find((x) => x.key === e.key);
        return (
          <li
            key={e.key}
            className="flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/15 p-2"
            style={{ animation: "pop-in 300ms ease-out" }}
          >
            <img src={achievementArt(e.key)} alt="" className="h-9 w-9 object-contain" />
            <span className="text-sm">
              <b className="text-gold">New achievement:</b> {a?.name ?? e.key}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
