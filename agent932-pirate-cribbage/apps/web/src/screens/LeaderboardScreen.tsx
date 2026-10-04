import { useEffect, useState } from "react";
import { Link } from "wouter";
import { type Season, api } from "../api.js";
import { useAuth } from "../auth.js";
import { TierBadge } from "../components/TierBadge.js";
import goldMedalUrl from "../assets/ui/medal-gold.webp";
import silverMedalUrl from "../assets/ui/medal-silver.webp";
import bronzeMedalUrl from "../assets/ui/medal-bronze.webp";
import { CRIBBAGE_HOME } from "../routes.js";

const MEDALS = [goldMedalUrl, silverMedalUrl, bronzeMedalUrl];

interface Row {
  id: string;
  username: string;
  rating: number;
  rankedGames: number;
  rank: number;
  tier: string;
}

/** Current season's live ranking, or a past season's final standings. */
export function LeaderboardScreen() {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  // Rows are tagged with the season they belong to, so switching seasons shows "loading" until they arrive.
  const [loaded, setLoaded] = useState<{ seasonId: number; rows: Row[] } | null>(null);

  useEffect(() => {
    void api<{ seasons: Season[] }>("/api/seasons").then((r) => setSeasons(r.seasons));
  }, []);
  const current = seasons.find((s) => !s.endedAt);
  const showing = seasons.find((s) => s.id === selected) ?? current;
  const isPast = !!showing?.endedAt;

  useEffect(() => {
    if (!showing) return;
    const seasonId = showing.id;
    if (showing.endedAt) {
      void api<{ standings: (Omit<Row, "id"> & { userId: string })[] }>(
        `/api/seasons/${seasonId}/standings`,
      ).then((r) =>
        setLoaded({ seasonId, rows: r.standings.map((s) => ({ ...s, id: s.userId })) }),
      );
    } else {
      void api<{ players: Row[] }>("/api/leaderboard").then((r) =>
        setLoaded({ seasonId, rows: r.players }),
      );
    }
  }, [showing]);
  const rows = loaded && loaded.seasonId === showing?.id ? loaded.rows : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href={CRIBBAGE_HOME} className="text-sm text-parchment/70 hover:text-gold">
          ← Harbour
        </Link>
        <h1 className="font-pirate text-4xl text-gold">Most Feared</h1>
        <span className="w-16" />
      </header>

      {seasons.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <label htmlFor="season">Season</label>
          <select
            id="season"
            value={showing?.id ?? ""}
            onChange={(e) => setSelected(Number(e.target.value))}
            className="rounded-lg border border-parchment/30 bg-sea-deep px-2 py-1"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.endedAt ? " (final)" : " (current)"}
              </option>
            ))}
          </select>
        </div>
      )}
      {showing && (
        <p className="text-center text-xs text-parchment/60">
          {isPast
            ? `Final standings · ${new Date(showing.startedAt).toLocaleDateString()} – ${new Date(showing.endedAt!).toLocaleDateString()}`
            : `Started ${new Date(showing.startedAt).toLocaleDateString()} · ranked games only`}
        </p>
      )}

      {rows?.length === 0 && (
        <p className="text-center text-parchment/60">
          {isPast
            ? "Nobody played ranked that season."
            : "No ranked games yet this season. Be the first to set sail!"}
        </p>
      )}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-parchment/70">
              <th className="py-1">#</th>
              <th className="py-1">Pirate</th>
              <th className="py-1">Tier</th>
              <th className="py-1 text-right">Rating</th>
              <th className="py-1 text-right">Games</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-parchment/10 ${r.id === user?.id ? "bg-gold/10" : ""}`}
              >
                <td className="py-1.5 tabular-nums">
                  {r.rank <= 3 ? (
                    <img
                      src={MEDALS[r.rank - 1]}
                      alt={`${r.rank}`}
                      className="h-7 w-auto drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
                    />
                  ) : (
                    r.rank
                  )}
                </td>
                <td className="py-1.5 font-semibold">{r.username}</td>
                <td className="py-1.5">
                  <TierBadge tier={r.tier} />
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.rating}</td>
                <td className="py-1.5 text-right tabular-nums">{r.rankedGames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
