import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import type { PlayerStats } from "@pirate/engine";
import { ApiError, type Friend, type FriendsResponse, api } from "../api.js";
import type { Menu } from "../online/protocol.js";
import { socket } from "../online/socket.js";

function TierBadge({ friend }: { friend: Friend }) {
  return (
    <span
      className="rounded bg-sea-deep px-1.5 text-[11px] text-parchment/80"
      title={`Rating ${friend.rating}`}
    >
      {friend.tier}
    </span>
  );
}

/** Your record against one friend: the rows from the "Friends" part of the stats sheet. */
function HeadToHead({ friend }: { friend: Friend }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  useEffect(() => {
    void api<{ stats: PlayerStats }>(`/api/friends/${friend.id}/stats`).then((r) =>
      setStats(r.stats),
    );
  }, [friend.id]);
  if (!stats) return <p className="text-sm text-parchment/60">Reading the log…</p>;
  if (stats.matchesPlayed === 0)
    return <p className="text-sm text-parchment/60">No games together yet.</p>;
  const rows: [string, string | number][] = [
    ["Matches played", stats.matchesPlayed],
    ["Wins", stats.wins],
    ["Win rate", stats.winRate.toFixed(2)],
    ["Win streak", stats.winStreak],
    ["Best win streak", stats.winStreakMax],
    ["Skunks given", stats.skunksGiven],
    ["Times skunked", stats.skunksTaken],
    ["Losses", stats.losses],
  ];
  return (
    <table className="w-full text-sm" aria-label={`Your record against ${friend.username}`}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-parchment/10">
            <td className="py-0.5 text-parchment/80">{label}</td>
            <td className="py-0.5 text-right tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FriendsScreen() {
  const [data, setData] = useState<FriendsResponse | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [challenged, setChallenged] = useState<string | null>(null);

  const load = useCallback(() => api<FriendsResponse>("/api/friends").then(setData), []);
  useEffect(() => {
    void load();
    // Refresh when someone sends, accepts or removes a request, and every so often for who's online.
    const release = socket.use();
    const stop = socket.listen((m) => {
      if (m.t === "friends") void load();
      if (m.t === "error" && !m.gameId) setMessage(m.message);
    });
    const poll = setInterval(() => void load(), 20_000);
    return () => {
      clearInterval(poll);
      stop();
      release();
    };
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ accepted: boolean; friend: Friend }>("/api/friends/requests", {
        body: { username: name },
      });
      setMessage(
        r.accepted
          ? `You and ${r.friend.username} are now friends!`
          : `Request sent to ${r.friend.username}`,
      );
      setName("");
      void load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Couldn't reach the server");
    }
  }

  const accept = (f: Friend) =>
    api(`/api/friends/requests/${f.id}/accept`, { body: {} }).then(load);
  const remove = (f: Friend) => api(`/api/friends/${f.id}`, { method: "DELETE" }).then(load);
  const challenge = (f: Friend, menu: Menu) => {
    setMessage(null);
    socket.send({ t: "challenge", friendId: f.id, menu });
    setChallenged(f.id);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-parchment/70 hover:text-gold">
          ← Harbour
        </Link>
        <h1 className="font-pirate text-4xl text-gold">Crew</h1>
        <span className="w-16" />
      </header>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a friend by username"
          aria-label="Friend's username"
          className="min-w-0 flex-1 rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold"
        />
        <button type="submit" className="btn-primary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {message && (
        <p role="status" className="text-sm text-parchment/85">
          {message}
        </p>
      )}

      {data && data.incoming.length > 0 && (
        <section aria-label="Friend requests">
          <h2 className="mb-2 font-pirate text-2xl text-gold">Requests</h2>
          {data.incoming.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 border-t border-parchment/10 py-2"
            >
              <span>
                {f.username} <TierBadge friend={f} />
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary px-3 py-1 text-sm"
                  onClick={() => void accept(f)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1 text-sm"
                  onClick={() => void remove(f)}
                >
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section aria-label="Friends">
        <h2 className="mb-2 font-pirate text-2xl text-gold">Friends</h2>
        {data?.friends.length === 0 && (
          <p className="text-sm text-parchment/60">No crew yet. Add a friend by their username.</p>
        )}
        {data?.friends.map((f) => (
          <div key={f.id} className="border-t border-parchment/10 py-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex items-center gap-2 text-left"
                onClick={() => setOpen(open === f.id ? null : f.id)}
                aria-expanded={open === f.id}
              >
                <span
                  className={`h-2 w-2 rounded-full ${f.online ? "bg-green-400" : "bg-parchment/30"}`}
                  aria-label={f.online ? "online" : "offline"}
                />
                <span className="font-semibold">{f.username}</span>
                <TierBadge friend={f} />
              </button>
              {f.online && (
                <span className="flex gap-1">
                  {challenged === f.id ? (
                    <span className="text-xs text-parchment/70">Challenge sent…</span>
                  ) : (
                    (["classic", "pirate"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs capitalize"
                        onClick={() => challenge(f, { variant: v, powerCost: 0 })}
                      >
                        ⚔️ {v}
                      </button>
                    ))
                  )}
                </span>
              )}
            </div>
            {open === f.id && (
              <div className="mt-2 flex flex-col gap-2 rounded-lg bg-sea-deep/60 p-3">
                <HeadToHead friend={f} />
                <button
                  type="button"
                  className="self-end text-xs text-parchment/60 hover:text-red-300"
                  onClick={() => void remove(f)}
                >
                  Remove friend
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      {data && data.outgoing.length > 0 && (
        <section aria-label="Sent requests">
          <h2 className="mb-2 text-sm text-parchment/70">Waiting for them to accept</h2>
          {data.outgoing.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 py-1 text-sm">
              <span>{f.username}</span>
              <button
                type="button"
                className="text-xs text-parchment/60 hover:text-gold"
                onClick={() => void remove(f)}
              >
                Cancel
              </button>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
