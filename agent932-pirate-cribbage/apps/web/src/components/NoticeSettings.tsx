import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useEmailEnabled } from "../email.js";

interface Notices {
  game: boolean;
  friends: boolean;
}

/** Opt-in email notices. Only shown when the server can send email. */
export function NoticeSettings() {
  const enabled = useEmailEnabled();
  const [n, setN] = useState<Notices | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (enabled) void api<Notices>("/api/auth/notices").then(setN);
  }, [enabled]);
  if (!enabled || !n) return null;

  async function change(next: Notices) {
    setN(next);
    setError(null);
    try {
      await api("/api/auth/notices", { method: "PUT", body: next });
    } catch {
      setError("Couldn't save that; try again");
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby="notices-heading">
      <h2 id="notices-heading" className="font-pirate text-2xl text-gold">
        Email me when…
      </h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={n.game}
          onChange={(e) => void change({ ...n, game: e.target.checked })}
          className="accent-[var(--color-gold)]"
        />
        I've left an online game and my opponent is waiting
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={n.friends}
          onChange={(e) => void change({ ...n, friends: e.target.checked })}
          className="accent-[var(--color-gold)]"
        />
        Someone sends me a friend request
      </label>
      <p className="text-xs text-parchment/60">
        Every email has a link to turn these off. We never send anything else.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
