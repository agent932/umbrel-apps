import { useState } from "react";
import { Link } from "wouter";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { AvatarPicker } from "../components/AvatarPicker.js";
import { CRIBBAGE_HOME } from "../routes.js";

/** Pick your portrait, and change your password (e.g. after an admin gave you a temporary one). */
export function AccountScreen() {
  const { user } = useAuth();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    if (data.get("next") !== data.get("confirm")) {
      setMessage({ ok: false, text: "The new passwords don't match" });
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", {
        body: { current: data.get("current"), next: data.get("next") },
      });
      setMessage({
        ok: true,
        text: "Password changed. You've been signed out on your other devices.",
      });
      form.reset();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof ApiError ? err.message : "Couldn't reach the server",
      });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 py-6">
      <Link href={CRIBBAGE_HOME} className="text-sm text-parchment/70 hover:text-gold">
        ← Harbour
      </Link>
      <h1 className="text-center font-pirate text-4xl text-gold">Your account</h1>
      <p className="text-center text-sm text-parchment/80">
        Signed in as <b className="text-gold">{user?.username}</b> ({user?.email})
      </p>
      <AvatarPicker />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="font-pirate text-2xl text-gold">Change password</h2>
        <label className="flex flex-col gap-1 text-sm">
          Current password
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          New password again
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={field}
          />
        </label>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`text-sm ${message.ok ? "text-parchment" : "text-red-300"}`}
          >
            {message.text}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          Change password
        </button>
      </form>
    </main>
  );
}
