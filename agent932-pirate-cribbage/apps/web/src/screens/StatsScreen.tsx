import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { PlayerStats } from "@pirate/engine";
import { type StatsResponse, api } from "../api.js";
import { BarChart } from "../components/BarChart.js";
import { AchievementGrid } from "../components/Achievements.js";

type Fmt = "int" | "rate" | "avg" | "share";
interface Row {
  label: string;
  get: (s: PlayerStats) => number | null;
  fmt: Fmt;
}

const r = (label: string, get: Row["get"], fmt: Fmt = "int"): Row => ({ label, get, fmt });

/** The rows of the stats sheet, grouped. */
const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Matches",
    rows: [
      r("Matches played", (s) => s.matchesPlayed),
      r("Wins", (s) => s.wins),
      r("Losses", (s) => s.losses),
      r("Win rate", (s) => s.winRate, "rate"),
      r("Win rate starting as dealer", (s) => s.winRateStartDealer, "rate"),
      r("Win rate starting as pone", (s) => s.winRateStartPone, "rate"),
      r("Win streak", (s) => s.winStreak),
      r("Best win streak", (s) => s.winStreakMax),
      r("Loss streak", (s) => s.lossStreak),
      r("Started as dealer", (s) => s.startAsDealer),
      r("Started as pone", (s) => s.startAsPone),
      r("Skunks given", (s) => s.skunksGiven),
      r("Times skunked", (s) => s.skunksTaken),
    ],
  },
  {
    title: "Rounds",
    rows: [
      r("Rounds played", (s) => s.roundsPlayed),
      r("Max round points", (s) => s.round.max),
      r("Max as dealer", (s) => s.round.maxDealer),
      r("Max as pone", (s) => s.round.maxPone),
      r("Avg round points", (s) => s.round.avg, "avg"),
      r("Avg (opponent)", (s) => s.round.avgOpp, "avg"),
      r("Avg as dealer", (s) => s.round.avgDealer, "avg"),
      r("Avg as dealer (opponent)", (s) => s.round.avgDealerOpp, "avg"),
      r("Avg as pone", (s) => s.round.avgPone, "avg"),
      r("Avg as pone (opponent)", (s) => s.round.avgPoneOpp, "avg"),
    ],
  },
  {
    title: "Pegging",
    rows: [
      r("Max pegging points", (s) => s.pegging.max),
      r("Max as dealer", (s) => s.pegging.maxDealer),
      r("Max as pone", (s) => s.pegging.maxPone),
      r("Avg pegging points", (s) => s.pegging.avg, "avg"),
      r("Avg (opponent)", (s) => s.pegging.avgOpp, "avg"),
      r("Avg as dealer", (s) => s.pegging.avgDealer, "avg"),
      r("Avg as dealer (opponent)", (s) => s.pegging.avgDealerOpp, "avg"),
      r("Avg as pone", (s) => s.pegging.avgPone, "avg"),
      r("Avg as pone (opponent)", (s) => s.pegging.avgPoneOpp, "avg"),
    ],
  },
  {
    title: "Hands",
    rows: [
      r("Max hand points", (s) => s.hand.max),
      r("Max as dealer", (s) => s.hand.maxDealer),
      r("Max as pone", (s) => s.hand.maxPone),
      r("Avg hand points", (s) => s.hand.avg, "avg"),
      r("Avg (opponent)", (s) => s.hand.avgOpp, "avg"),
      r("Avg as dealer", (s) => s.hand.avgDealer, "avg"),
      r("Avg as dealer (opponent)", (s) => s.hand.avgDealerOpp, "avg"),
      r("Avg as pone", (s) => s.hand.avgPone, "avg"),
      r("Avg as pone (opponent)", (s) => s.hand.avgPoneOpp, "avg"),
      r("0–7 point hands", (s) => s.handBands.low, "share"),
      r("8–15 point hands", (s) => s.handBands.mid, "share"),
      r("16–29 point hands", (s) => s.handBands.high, "share"),
      r("0–7 (opponent)", (s) => s.handBands.lowOpp, "share"),
      r("8–15 (opponent)", (s) => s.handBands.midOpp, "share"),
      r("16–29 (opponent)", (s) => s.handBands.highOpp, "share"),
    ],
  },
  {
    title: "Crib",
    rows: [
      r("Max crib points", (s) => s.crib.max),
      r("Avg crib points", (s) => s.crib.avg, "avg"),
      r("Avg crib (opponent)", (s) => s.crib.avgOpp, "avg"),
    ],
  },
  {
    title: "Discards",
    rows: [
      r("Avg hand analyzer score", (s) => s.analyzer.avg, "avg"),
      r("Avg hand analyzer (opponent)", (s) => s.analyzer.avgOpp, "avg"),
    ],
  },
];

function format(v: number | null, fmt: Fmt): string {
  if (v === null) return "—";
  switch (fmt) {
    case "int":
      return String(v);
    case "rate":
      return v.toFixed(2);
    case "avg":
      return v.toFixed(2);
    case "share":
      return v.toFixed(3);
  }
}

const RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function StatsScreen() {
  const [variant, setVariant] = useState<StatsResponse["variant"]>("all");
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState("all");

  useEffect(() => {
    let live = true;
    api<StatsResponse>(`/api/stats?variant=${variant}`)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [variant]);

  const focused = data?.buckets.find((b) => b.key === focus)?.stats;

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-parchment/70 hover:text-gold">
          ← Harbour
        </Link>
        <h1 className="font-pirate text-4xl text-gold">Ship's Log</h1>
        <span className="w-16" />
      </header>

      <div className="flex justify-center gap-2" role="group" aria-label="Rules filter">
        {(["all", "classic", "pirate"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={variant === v}
            onClick={() => setVariant(v)}
            className={`rounded-full border px-3 py-1 text-sm capitalize ${variant === v ? "border-gold bg-gold/20" : "border-parchment/25"}`}
          >
            {v === "all" ? "All rules" : v}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-center text-red-300">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-center text-parchment/60">Reading the log…</p>}

      <AchievementGrid />

      {data && (
        <>
          <div className="panel overflow-x-auto p-2">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-night/90">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-parchment/70">Stat</th>
                  {data.buckets.map((b) => (
                    <th key={b.key} className="px-3 py-2 text-right font-semibold">
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {SECTIONS.map((section) => (
                <tbody key={section.title}>
                  <tr>
                    <th colSpan={data.buckets.length + 1} className="px-3 pt-4 pb-1.5 text-left">
                      <span className="scroll-title !text-lg">{section.title}</span>
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={section.title + row.label} className="border-t border-parchment/10">
                      <td className="px-3 py-1 text-parchment/85">{row.label}</td>
                      {data.buckets.map((b) => (
                        <td key={b.key} className="px-3 py-1 text-right tabular-nums">
                          {b.stats.matchesPlayed === 0 ? "—" : format(row.get(b.stats), row.fmt)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <section className="panel flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="scroll-title mr-2 !text-xl">Charts</h2>
              {data.buckets.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={focus === b.key}
                  onClick={() => setFocus(b.key)}
                  className={`rounded-full border px-3 py-0.5 text-xs ${focus === b.key ? "border-gold bg-gold/20" : "border-parchment/25"}`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {focused && focused.roundsPlayed > 0 ? (
              <>
                <BarChart
                  title="Your hand scores"
                  labels={focused.handCounts.map((_, i) => String(i))}
                  values={focused.handCounts}
                  format={(v) =>
                    `${v} hand${v === 1 ? "" : "s"} (${((v / focused.roundsPlayed) * 100).toFixed(1)}%)`
                  }
                />
                <BarChart
                  title={`Cards dealt to you by rank (${focused.dealtTotal} cards)`}
                  labels={RANK_LABELS}
                  values={focused.dealtByRank.slice(1)}
                  format={(v) => `${v} (${((v / focused.dealtTotal) * 100).toFixed(2)}%)`}
                  height={120}
                />
              </>
            ) : (
              <p className="text-sm text-parchment/60">
                No finished games here yet. Go play a few hands!
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
