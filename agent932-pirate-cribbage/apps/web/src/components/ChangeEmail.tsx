import { useState } from "react";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";

/** Change the email on your account, after checking your password (D-19). */
export function ChangeEmail() {
  const { refresh } = useAuth();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    try {
      const { user } = await api<{ user: { email: string } }>("/api/auth/email", {
        body: { email: data.get("email"), password: data.get("password") },
      });
      setMessage({
        ok: true,
        text: `Email changed to ${user.email}. You've been signed out on your other devices.`,
      });
      form.reset();
      // The "Signed in as" line (and the support form) pick up the new address.
      await refresh();
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Change email">
      <h2 className="font-pirate text-2xl text-gold">Change email</h2>
      <label className="flex flex-col gap-1 text-sm">
        New email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Current password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
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
        Change email
      </button>
    </form>
  );
}
