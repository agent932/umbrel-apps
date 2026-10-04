import { useState } from "react";
import { Link } from "wouter";
import { api } from "../api.js";

const field =
  "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold";

/** /forgot: ask for a reset link by email. */
export function ForgotScreen() {
  const [login, setLogin] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-center font-pirate text-4xl text-gold">Forgot your password?</h1>
      {sent ? (
        <p role="status" className="panel p-4 text-center">
          If that account exists, we've emailed it a link to choose a new password. It works for an
          hour. Check your spam folder too.
        </p>
      ) : (
        <form
          className="panel flex flex-col gap-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await api("/api/auth/forgot", { body: { login } }).catch(() => undefined);
            setBusy(false);
            setSent(true);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Username or email
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
              autoComplete="username"
              className={field}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={busy}>
            Email me a reset link
          </button>
        </form>
      )}
      <Link href="/login" className="text-center text-sm text-parchment/70 hover:text-gold">
        Back to sign in
      </Link>
    </main>
  );
}

/** /reset/:token: choose a new password from an emailed link. */
export function ResetScreen({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-6">
      <h1 className="text-center font-pirate text-4xl text-gold">Choose a new password</h1>
      {done ? (
        <p role="status" className="panel p-4 text-center">
          Done! Your password is changed and you've been signed out everywhere.{" "}
          <Link href="/login" className="text-gold underline">
            Sign in
          </Link>
        </p>
      ) : (
        <form
          className="panel flex flex-col gap-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (data.get("password") !== data.get("confirm")) {
              setError("The passwords don't match");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await api("/api/auth/reset", { body: { token, password: data.get("password") } });
              setDone(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            New password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            New password again
            <input
              name="confirm"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              className={field}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy}>
            Set new password
          </button>
        </form>
      )}
    </main>
  );
}
