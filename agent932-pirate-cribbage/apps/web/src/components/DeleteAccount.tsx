import { useState } from "react";
import { useLocation } from "wouter";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

/** Delete your account for good, after a second "are you sure" and your password. */
export function DeleteAccount() {
  const { refresh } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/delete", {
        body: { password: new FormData(e.currentTarget).get("password") },
      });
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server");
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-red-400/30 p-4">
      <h2 className="font-pirate text-2xl text-red-200">Delete account</h2>
      <p className="text-sm text-parchment/80">
        Removes your account, friends, stats, achievements and unfinished games for good. Your
        doubloons go too. Finished matches stay in your opponents' history without your name. This
        can't be undone.
      </p>
      {!open ? (
        <button
          type="button"
          className="self-start rounded-lg border border-red-400/50 px-3 py-2 text-sm text-red-200 hover:bg-red-900/30"
          onClick={() => setOpen(true)}
        >
          Delete my account…
        </button>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Type your password to confirm
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-red-300"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-red-800 px-3 py-2 text-sm font-semibold text-parchment hover:bg-red-700 disabled:opacity-50"
            >
              Delete forever
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-parchment/70 hover:text-gold"
              onClick={() => (setOpen(false), setError(null))}
            >
              Keep my account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
