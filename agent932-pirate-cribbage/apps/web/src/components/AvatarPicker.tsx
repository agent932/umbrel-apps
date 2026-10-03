import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth.js";
import { AVATARS } from "../brand/avatars.js";

/** Pick the crew portrait other players see next to your name. */
export function AvatarPicker() {
  const { user, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(avatar: number | null) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/avatar", { body: { avatar } });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your portrait");
    } finally {
      setBusy(false);
    }
  }

  const current = user?.avatar ?? null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="portrait-heading">
      <h2 id="portrait-heading" className="font-pirate text-2xl text-gold">
        Your portrait
      </h2>
      <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="Crew portraits">
        {AVATARS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={current === a.id}
            aria-label={a.name}
            disabled={busy}
            onClick={() => pick(a.id)}
            className={`aspect-square rounded-full bg-cover bg-center shadow-lg transition ${
              current === a.id
                ? "ring-4 ring-gold"
                : "opacity-80 ring-2 ring-brass/60 hover:opacity-100"
            }`}
            style={{ backgroundImage: `url("${a.url}")` }}
          />
        ))}
      </div>
      {current !== null && (
        <button
          type="button"
          className="self-start text-sm text-parchment/70 hover:text-gold"
          disabled={busy}
          onClick={() => pick(null)}
        >
          Use my initial instead
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
