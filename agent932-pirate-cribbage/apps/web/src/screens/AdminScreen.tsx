import { useCallback, useEffect, useRef, useState } from "react";
import { NavBar } from "../components/NavBar.js";
import { ApiError, type Season, api } from "../api.js";
import { useAuth } from "../auth.js";
import { CRIBBAGE_HOME } from "../routes.js";
import { DoubloonsSheet } from "../components/AdminDoubloons.js";
import { DoubloonIcon } from "../components/Doubloons.js";
import { EmailSettingsPanel } from "../components/EmailSettingsPanel.js";
import { SupportInbox } from "../components/SupportInbox.js";

interface Overview {
  players: number;
  newPlayersThisWeek: number;
  disabledPlayers: number;
  matchesTotal: number;
  matchesToday: Record<string, number>;
  liveOnlineGames: number;
  liveBotGames: number;
  /** Doubloons paid for play since 00:00 UTC (admin adjustments aren't counted). Optional, like
   * every doubloon field here: the app may reach a server older than itself. */
  doubloonsIssuedToday?: number;
  /** Who earned the most today, to spot farming. */
  topEarnersToday?: { id: string; username: string; doubloons: number }[];
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
  doubloons?: number;
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

interface AdminShopItem {
  id: string;
  /** "board" or "deck" (a card back). */
  type: string;
  name: string;
  /** In doubloons; 0 = free, owned by everyone. */
  price: number;
  isDefault: boolean;
  /** False once taken off sale: its owners keep it. */
  available: boolean;
  /** Players who bought it; null for a free item, which everyone has. */
  owners: number | null;
}

/** GET /api/admin/shop. */
interface AdminShop {
  open: boolean;
  /** The switch has been saved. Until then the shop is closed by default. */
  saved: boolean;
  /** Every item, on sale or not, in shop order. */
  items: AdminShopItem[];
}

const TABS = ["Overview", "Players", "Live games", "Seasons", "Shop", "Support", "Email"] as const;
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
    <div className="panel p-3">
      <div className="text-xs text-parchment/70">{label}</div>
      <div className="num text-2xl text-gold lantern-glow">{value}</div>
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
      <Tile
        label="Doubloons issued today"
        value={(o.doubloonsIssuedToday ?? 0).toLocaleString()}
        note="for play, since 00:00 UTC"
      />
      <section className="panel col-span-2 p-3 sm:col-span-3" aria-labelledby="top-earners-heading">
        <h2 id="top-earners-heading" className="text-xs text-parchment/70">
          Top earners today
        </h2>
        {o.topEarnersToday?.length ? (
          <ol className="mt-1 flex flex-col text-sm">
            {o.topEarnersToday.map((e, i) => (
              <li
                key={e.id}
                className="flex justify-between gap-3 border-t border-parchment/10 py-1 first:border-0"
              >
                <span>
                  {i + 1}. <b>{e.username}</b>
                </span>
                <span className="inline-flex items-center gap-1 text-gold tabular-nums">
                  <DoubloonIcon className="h-4 w-4" />
                  {e.doubloons.toLocaleString()}
                  <span className="sr-only"> doubloons</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-sm text-parchment/60">No doubloons earned yet today.</p>
        )}
      </section>
    </div>
  );
}

function PlayersTab() {
  const { user: me, refresh } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminUser[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The player whose doubloons are open. */
  const [wallet, setWallet] = useState<AdminUser | null>(null);
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
              <th className="py-1 pl-3 text-right">Games</th>
              <th className="py-1 pl-3 text-right">Rating</th>
              <th className="py-1 pl-3 text-right">Doubloons</th>
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
                <td className="py-1.5 pl-3 text-right tabular-nums">{u.matches}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {u.rating} <span className="text-xs text-parchment/60">{u.tier}</span>
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {(u.doubloons ?? 0).toLocaleString()}
                </td>
                <td className="py-1.5 text-right">
                  <span className="flex flex-wrap justify-end gap-1">
                    {/* Any admin may change anyone's doubloons, their own included. */}
                    <button
                      type="button"
                      className="btn-secondary px-2 py-0.5 text-xs"
                      aria-label={`Doubloons for ${u.username}`}
                      onClick={() => setWallet(u)}
                    >
                      Doubloons…
                    </button>
                    {u.id !== me?.id && (
                      <>
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
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wallet && (
        <DoubloonsSheet
          player={{ ...wallet, doubloons: wallet.doubloons ?? 0 }}
          onClose={() => setWallet(null)}
          onChanged={(doubloons) => {
            setRows(
              (all) => all?.map((u) => (u.id === wallet.id ? { ...u, doubloons } : u)) ?? null,
            );
            // Your own balance shows in the account bar too.
            if (wallet.id === me?.id) void refresh();
          }}
        />
      )}
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

const TYPE_NAMES: Record<string, string> = { board: "Board", deck: "Card back" };

/**
 * The shop switch, and every item with how many players bought it. Opening or closing asks twice.
 * The list is read only: prices and items change with a release, and a mistaken purchase is put
 * right with a doubloon adjustment (the player keeps the item). The buttons are never `disabled`
 * while busy (Safari would drop focus): they say aria-disabled and do nothing.
 */
function ShopTab() {
  const { refresh } = useAuth();
  const [shop, setShop] = useState<AdminShop | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Open or Close was pressed once, and waits for "Yes". */
  const [asking, setAsking] = useState(false);
  /** The switch's height when it was pressed: the question takes its place at least that tall, so
   *  "Yes" never lands where the switch was and a double click can't open or close the shop. */
  const [switchHeight, setSwitchHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const switchButton = useRef<HTMLButtonElement>(null);
  const question = useRef<HTMLParagraphElement>(null);
  /** The button that had focus has gone: give focus to the switch once it's back on the page. */
  const refocus = useRef(false);

  useEffect(() => {
    let live = true;
    api<AdminShop>("/api/admin/shop").then(
      (r) => live && setShop(r),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  // Focus goes to the question, not to "Yes", so a double Enter can't answer it either. Tab is next.
  useEffect(() => {
    if (asking) question.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (!refocus.current || !switchButton.current) return;
    refocus.current = false;
    switchButton.current.focus();
  });

  async function save(open: boolean, done: string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    let ok = false;
    try {
      const r = await api<{ open: boolean }>("/api/admin/shop", { body: { open } });
      setShop((s) => s && { ...s, open: r.open, saved: true });
      setNotice({ ok: true, text: done });
      ok = true;
      // Your own Shop links change with it ("Shop (preview)" while it's closed).
      void refresh().catch(() => {});
    } catch (e) {
      setNotice({
        ok: false,
        text: e instanceof ApiError ? e.message : "Couldn't reach the server",
      });
    }
    // "Yes" goes either way, and "Save as closed" once it's saved.
    refocus.current = asking || ok;
    setAsking(false);
    setBusy(false);
  }

  if (failed)
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-red-300">Couldn't load the shop</p>
        <button
          type="button"
          className="btn-secondary min-h-11"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  if (!shop) return <p className="text-parchment/60">Loading…</p>;
  const opening = !shop.open;

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-col gap-3 p-4">
        <p className="font-semibold">
          {shop.open
            ? "The shop is open."
            : "The shop is closed to players. Admins can preview it; items you use show only to you."}
        </p>
        {!shop.saved && (
          <p className="text-sm text-parchment/80">
            Not saved yet: closed by default. Save it once, so your choice stays if a later release
            changes the default.
          </p>
        )}
        {asking ? (
          <div role="group" aria-labelledby="shop-ask" className="flex flex-col gap-2">
            <p
              ref={question}
              id="shop-ask"
              tabIndex={-1}
              style={{ minHeight: switchHeight }}
              className="text-sm outline-none"
            >
              {opening
                ? "Open the shop to every player? They'll see the Shop links and can buy."
                : "Close the shop? Players can't buy until it opens again, but they keep what they own and can still use it."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary min-h-11"
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                onClick={() =>
                  void save(
                    opening,
                    opening
                      ? "The shop is open to players."
                      : "The shop is closed to players. They keep what they bought.",
                  )
                }
              >
                {busy
                  ? opening
                    ? "Opening…"
                    : "Closing…"
                  : opening
                    ? "Yes, open it"
                    : "Yes, close it"}
              </button>
              <button
                type="button"
                className="btn-secondary min-h-11"
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (busy) return;
                  refocus.current = true;
                  setAsking(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              ref={switchButton}
              type="button"
              className={`${opening ? "btn-primary" : "btn-secondary"} min-h-11`}
              aria-disabled={busy || undefined}
              onClick={(e) => {
                if (busy) return;
                setNotice(null);
                setSwitchHeight(e.currentTarget.offsetHeight);
                setAsking(true);
              }}
            >
              {opening ? "Open the shop to players" : "Close the shop"}
            </button>
            {!shop.saved && (
              <button
                type="button"
                className="btn-secondary min-h-11"
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                onClick={() => void save(false, "Saved as closed.")}
              >
                {busy ? "Saving…" : "Save as closed"}
              </button>
            )}
          </div>
        )}
        {/* Always on the page, so what they say is announced. */}
        <p role="status" className={notice?.ok ? "text-gold" : "sr-only"}>
          {notice?.ok ? notice.text : ""}
        </p>
        <p role="alert" className={notice && !notice.ok ? "text-red-300" : "sr-only"}>
          {notice && !notice.ok ? notice.text : ""}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="pb-1 text-left text-xs text-parchment/70">
            Every item, on sale or not
          </caption>
          <thead>
            <tr className="text-left text-parchment/70">
              <th className="py-1">Item</th>
              <th className="py-1 pl-3">Type</th>
              <th className="py-1 pl-3 text-right">Price</th>
              <th className="py-1 pl-3 text-right">Owners</th>
            </tr>
          </thead>
          <tbody>
            {shop.items.map((i) => (
              <tr key={i.id} className="border-t border-parchment/10">
                <td className="py-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b>{i.name}</b>
                    {i.isDefault && (
                      <span className="rounded bg-gold/25 px-1 text-[10px] text-gold uppercase">
                        Default
                      </span>
                    )}
                    {!i.available && (
                      <span className="rounded bg-red-900/60 px-1 text-[10px] uppercase">
                        Off sale
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-parchment/60">{i.id}</div>
                </td>
                <td className="py-1.5 pl-3">{TYPE_NAMES[i.type] ?? i.type}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {i.price === 0 ? (
                    "Free"
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gold">
                      <DoubloonIcon className="h-4 w-4" />
                      {i.price.toLocaleString()}
                      <span className="sr-only"> doubloons</span>
                    </span>
                  )}
                </td>
                <td className="py-1.5 pl-3 text-right tabular-nums">
                  {/* A free item is everyone's: there are no buyers to count. */}
                  {i.owners === null ? "Everyone" : i.owners.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-parchment/60">
        Read only: prices and items change with a new release. To put a mistaken purchase right,
        give the doubloons back under Players; the player keeps the item.
      </p>
    </div>
  );
}

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <>
      <NavBar title="Captain's Quarters" back={{ to: CRIBBAGE_HOME, label: "Harbour" }} />
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 pt-2 pb-6">
        <h1 className="text-center font-pirate text-4xl text-gold">Captain's Quarters</h1>
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
          {tab === "Shop" && <ShopTab />}
          {tab === "Support" && <SupportInbox />}
          {tab === "Email" && <EmailSettingsPanel />}
        </section>
      </main>
    </>
  );
}
