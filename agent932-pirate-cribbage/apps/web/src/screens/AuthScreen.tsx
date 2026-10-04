import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ApiError } from "../api.js";
import { useAuth } from "../auth.js";
import { CRIBBAGE_HOME } from "../routes.js";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const { login, signup } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signup(
          String(form.get("username")),
          String(form.get("email")),
          String(form.get("password")),
        );
      } else {
        await login(String(form.get("login")), String(form.get("password")));
      }
      navigate(CRIBBAGE_HOME);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 text-parchment outline-none focus:border-gold";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 px-4 py-12">
      <Link href={CRIBBAGE_HOME} className="text-sm text-parchment/70 hover:text-gold">
        ← Harbour
      </Link>
      <h1 className="text-center font-pirate text-4xl text-gold">
        {mode === "signup" ? "Join the crew" : "Welcome aboard"}
      </h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "signup" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              Username
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_]+"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Email
              <input name="email" type="email" autoComplete="email" required className={field} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Username or email
            <input name="login" autoComplete="username" required className={field} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            className={field}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {mode === "signup" ? "Sign up" : "Log in"}
        </button>
      </form>
      <p className="text-center text-sm text-parchment/70">
        {mode === "signup" ? (
          <>
            Already a crew member?{" "}
            <Link href="/login" className="text-gold underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="text-gold underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
