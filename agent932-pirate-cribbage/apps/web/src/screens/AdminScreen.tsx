import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ApiError, type Season, api } from "../api.js";
import { useAuth } from "../auth.js";

interface Overview {
  players: number;
  newPlayersThisWeek: number;
  disabledPlayers: number;
  matchesTotal: number;
  matchesToday: Record<string, number>;
  liveOnlineGames: number;
  liveBotGames: number;
  season: Season;
  version: string;
  uptimeSeconds: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  rating: number;
  tier: string;
  rankedGames: number;
  isAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
  matches: number;
  online: boolean;
}

interface LiveGame {
  id: string;
  players: [string, string];
  online: [boolean, boolean];
  scores: [number, number];
  round: number;
  phase: string;
  ranked: boolean;
  variant: string;
  startedAt: string;
}

const TABS = ["Overview", "Players", "Live games", "Seasons"] as const;
type Tab = (typeof TABS)[number];

function uptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

const date = (iso: string) => new Date(iso).toLocaleDateString();

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-parchment/15 bg-sea-deep/60 p-3">
      <div className="text-xs text-parchment/70">{label}</div>
      <div className="font-serif text-2xl font-bold tabular-nums text-gold">{value}</div>
      {note && <div className="text-xs text-parchment/60">{note}</div>}
    </div>
  );
}

function OverviewTab() {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => void api<Overview>("/api/admin/overview").then(setO), []);
  if (!o) return <p className="text-parchment/60">Loading…</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Tile label="Players" value={o.players} note={`${o.newPlayersThisWeek} new this week`} />
      <Tile
        label="Matches played"
        value={o.matchesTotal}
        note={`${(o.matchesToday.ai ?? 0) + (o.matchesToday.online ?? 0)} in the last 24h`}
      />
      <Tile label="Live online games" value={o.liveOnlineGames} />
      <Tile label="Games vs the bot in progress" value={o.liveBotGames} />
      <Tile
        label="Ranked season"
        value={o.season.name}
        note={`since ${date(o.season.startedAt)}`}
      />
      <Tile label="Disabled accounts" value={o.disabledPlayers} />
      <Tile
        label="Server"
        value={uptime(o.uptimeSeconds)}
        note={`up · build ${o.version.slice(0, 7)}`}
      />
    </div>
  );
}

function PlayersTab() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api<{ users: AdminUser[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`).then((r) =>
        setRows(r.users),
      ),
    [q],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function run(label: string, path: string, body: object = {}, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    try {
      const res = await api<{ temporaryPassword?: string }>(path, { body });
      setNotice(
        res.temporaryPassword
          ? `Temporary password for ${label}: ${res.temporaryPassword}. Pass it on privately; they can change it under Account.`
          : `Done: ${label}`,
      );
      void load();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or email"
        aria-label="Search players"
        className="rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold"
      />
      {notice && (
        <p role="status" className="rounded-lg border border-gold/40 p-2 text-sm">
          {notice}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-parchment/70">
              <th className="py-1">Player</th>
              <th className="py-1">Joined</th>
              <th className="py-1 text-right">Games</th>
              <th className="py-1 text-right">Rating</th>
              <th className="py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((u) => (
              <tr
                key={u.id}
                className={`border-t border-parchment/10 ${u.disabledAt ? "opacity-50" : ""}`}
              >
                <td className="py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${u.online ? "bg-green-400" : "bg-parchment/30"}`}
                      aria-label={u.online ? "online" : "offline"}
                    />
                    <b>{u.username}</b>
                    {u.isAdmin && (
                      <span className="rounded bg-gold/25 px-1 text-[10px] text-gold">ADMIN</span>
                    )}
                    {u.disabledAt && (
                      <span className="rounded bg-red-900/60 px-1 text-[10px]">DISABLED</span>
                    )}
                  </div>
                  <div className="text-xs text-parchment/60">{u.email}</div>
                </td>
                <td className="py-1.5">{date(u.createdAt)}</td>
                <td className="py-1.5 text-right tabular-nums">{u.matches}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {u.rating} <span className="text-xs text-parchment/60">{u.tier}</span>
                </td>
                <td className="py-1.5 text-right">
                  {u.id !== me?.id && (
                    <span className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-0.5 text-xs"
                        onClick={() =>
                          void run(
                            u.username,
                            `/api/admin/users/${u.id}/reset-password`,
                            {},
                            `Reset ${u.username}'s password? They'll be signed out.`,
                          )
                        }
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btn-secondary px-2 py-0.5 text-xs"
                        onClick={() =>
                          void run(u.username, `/api/admin/users/${u.id}/admin`, {
                            isAdmin: !u.isAdmin,
                          })
                        }
                      >
                        {u.isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                      {u.disabledAt ? (
                        <button
                          type="button"
                          className="btn-secondary px-2 py-0.5 text-xs"
                          onClick={() => void run(u.username, `/api/admin/users/${u.id}/enable`)}
                        >
                          Enable
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-xl border border-red-400/60 px-2 py-0.5 text-xs text-red-200 hover:bg-red-900/40"
                          onClick={() =>
                            void run(
                              u.username,
                              `/api/admin/users/${u.id}/disable`,
                              {},
                              `Disable ${u.username}? They'll be signed out and can't log in.`,
                            )
                          }
                        >
                          Disable
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GamesTab() {
  const [games, setGames] = useState<LiveGame[] | null>(null);
  const load = useCallback(
    () => api<{ games: LiveGame[] }>("/api/admin/games").then((r) => setGames(r.games)),
    [],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);
  if (!games) return <p className="text-parchment/60">Loading…</p>;
  if (games.length === 0) return <p className="text-parchment/60">No online games right now.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {games.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-2 rounded-xl border border-parchment/15 p-3 text-sm"
        >
          <div>
            <div>
              <b>{g.players[0]}</b>
              {!g.online[0] && " (offline)"} {g.scores[0]} – {g.scores[1]} <b>{g.players[1]}</b>
              {!g.online[1] && " (offline)"}
            </div>
            <div className="text-xs text-parchment/60">
              Round {g.round} · {g.phase} · {g.ranked ? "ranked" : g.variant} · started{" "}
              {new Date(g.startedAt).toLocaleTimeString()}
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl border border-red-400/60 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40"
            onClick={() => {
              if (window.confirm("End this game? It won't count for either player."))
                void api(`/api/admin/games/${g.id}/end`, { body: {} }).then(load);
            }}
          >
            End game
          </button>
        </li>
      ))}
    </ul>
  );
}

function SeasonsTab() {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(
    () => api<{ seasons: Season[] }>("/api/seasons").then((r) => setSeasons(r.seasons)),
    [],
  );
  useEffect(() => void load(), [load]);
  const current = seasons?.find((s) => !s.endedAt);

  async function end() {
    if (!current) return;
    const ok = window.confirm(
      `End ${current.name}? Final standings are saved, every rating moves halfway back to 1000, and ${current.name.replace(/\d+$/, (n) => String(Number(n) + 1))} begins.`,
    );
    if (!ok) return;
    const r = await api<{ ended: { name: string; players: number }; started: Season }>(
      "/api/admin/seasons/end",
      { body: {} },
    );
    setNotice(
      `${r.ended.name} is over (${r.ended.players} ranked players). ${r.started.name} has begun!`,
    );
    void load();
  }

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/40 p-3">
          <div>
            <b className="text-gold">{current.name}</b>
            <div className="text-xs text-parchment/60">since {date(current.startedAt)}</div>
          </div>
          <button
            type="button"
            className="btn-primary px-3 py-1.5 text-sm"
            onClick={() => void end()}
          >
            End season
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <p className="text-xs text-parchment/60">
        Ending a season saves everyone's final rank, rating and tier (shown on the leaderboard under
        past seasons), pulls ratings halfway back to 1000, and resets ranked game counts.
      </p>
      <ul className="text-sm">
        {seasons
          ?.filter((s) => s.endedAt)
          .map((s) => (
            <li key={s.id} className="border-t border-parchment/10 py-1.5">
              {s.name}: {date(s.startedAt)} – {date(s.endedAt!)}
            </li>
          ))}
      </ul>
    </div>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-parchment/70 hover:text-gold">
          ← Harbour
        </Link>
        <h1 className="font-pirate text-4xl text-gold">Captain's Quarters</h1>
        <span className="w-16" />
      </header>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1 text-sm ${tab === t ? "border-gold bg-gold/20" : "border-parchment/25"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <section role="tabpanel" aria-label={tab}>
        {tab === "Overview" && <OverviewTab />}
        {tab === "Players" && <PlayersTab />}
        {tab === "Live games" && <GamesTab />}
        {tab === "Seasons" && <SeasonsTab />}
      </section>
    </main>
  );
}
