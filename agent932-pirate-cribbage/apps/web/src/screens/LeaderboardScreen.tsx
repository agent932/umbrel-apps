import { useEffect, useState } from "react";
import { Link } from "wouter";
import { api } from "../api.js";
import { useAuth } from "../auth.js";

interface Row {
  id: string;
  username: string;
  rating: number;
  rankedGames: number;
  rank: number;
  tier: string;
}

export function LeaderboardScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    void api<{ players: Row[] }>("/api/leaderboard").then((r) => setRows(r.players));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-parchment/70 hover:text-gold">
          ← Harbour
        </Link>
        <h1 className="font-pirate text-4xl text-gold">Most Feared</h1>
        <span className="w-16" />
      </header>
      {rows?.length === 0 && (
        <p className="text-center text-parchment/60">
          No ranked games yet. Be the first to set sail!
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
                <td className="py-1.5 tabular-nums">{r.rank}</td>
                <td className="py-1.5 font-semibold">{r.username}</td>
                <td className="py-1.5">{r.tier}</td>
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
