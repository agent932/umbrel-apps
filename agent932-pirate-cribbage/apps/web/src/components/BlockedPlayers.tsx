import { useEffect, useState } from "react";
import { ApiError, api } from "../api.js";

interface Blocked {
  id: string;
  username: string;
}

/** Account page: the players you've blocked, with a way to unblock each. */
export function BlockedPlayers() {
  const [blocked, setBlocked] = useState<Blocked[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ blocked: Blocked[] }>("/api/blocks")
      .then((r) => setBlocked(r.blocked))
      .catch(() => setError("Couldn't load your blocked players"));
  }, []);

  async function unblock(b: Blocked) {
    setError(null);
    try {
      await api(`/api/players/${encodeURIComponent(b.username)}/block`, { method: "DELETE" });
      setBlocked((list) => list?.filter((x) => x.id !== b.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server");
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Blocked players">
      <h2 className="font-pirate text-2xl text-gold">Blocked players</h2>
      <p className="text-sm text-parchment/70">
        To report or block someone, use Report or block in an online game's menu, tap their name on
        the leaderboard, or find them in your friends list.
      </p>
      {blocked?.length === 0 && (
        <p className="text-sm text-parchment/60">You haven't blocked anyone.</p>
      )}
      {blocked?.map((b) => (
        <div
          key={b.id}
          className="flex min-h-11 items-center justify-between gap-2 border-t border-parchment/10"
        >
          <span>{b.username}</span>
          <button
            type="button"
            className="btn-secondary px-3 py-1 text-sm"
            onClick={() => void unblock(b)}
          >
            Unblock
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
