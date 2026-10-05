import { useState } from "react";
import { NavBar } from "../components/NavBar.js";
import { Link } from "wouter";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { CRIBBAGE_HOME } from "../routes.js";

/** Same keys as the server's SUPPORT_TOPICS. */
export const SUPPORT_TOPICS = {
  help: "Help playing",
  account: "My account",
  bug: "Something's broken",
  feedback: "Ideas and feedback",
  other: "Something else",
} as const;
export type SupportTopic = keyof typeof SUPPORT_TOPICS;

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "I've never played cribbage. Where do I start?",
    a: (
      <>
        Open <Link href={CRIBBAGE_HOME}>Pirate Cribbage</Link> and tap{" "}
        <b>Learn to play with Peggy</b>. Peggy the parrot walks you through a whole hand, from the
        cut to counting the crib.
      </>
    ),
  },
  {
    q: "What are the pirate rules?",
    a: (
      <>
        An optional twist on classic cribbage: buried treasure, the Kraken, and six powers you can
        play during a hand. Tap a power on the table to see what it does. Choose <b>Classic</b>{" "}
        before you set sail if you'd rather play it straight.
      </>
    ),
  },
  {
    q: "How do I play a friend?",
    a: (
      <>
        Sign in, then under <b>Play online</b> tap <b>Invite a friend</b> and send them the link.
        The game starts as soon as they open it. You can also add them to your crew and challenge
        them when they're online.
      </>
    ),
  },
  {
    q: "Can I play without an account or a connection?",
    a: "Yes. Games against the computer crew work as a guest, even offline. An account keeps your stats, ranks and achievements and lets you play online.",
  },
  {
    q: "I forgot my password.",
    a: (
      <>
        Use <Link href="/forgot">Forgot your password?</Link> on the sign-in page to get a reset
        link by email. If that doesn't arrive, send us a message below.
      </>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <>
        Sign in, open <Link href="/account">Account</Link>, and choose <b>Delete account</b>. It's
        immediate. See the <Link href="/privacy">privacy policy</Link> for what's kept and for how
        long.
      </>
    ),
  },
];

/** deckhand.games/support: quick answers, then a contact form that lands in the Admin inbox. */
export function SupportScreen() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError(null);
    try {
      await api("/api/support", { body: data });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-parchment/30 bg-sea-deep px-3 py-2 outline-none focus:border-gold";
  return (
    <>
      <NavBar title="Help & support" back={{ to: "/", label: "Deckhand Games" }} />
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pt-2 pb-6 text-parchment/90">
        <header className="text-center">
          <h1 className="font-pirate text-4xl text-gold">Help &amp; support</h1>
          <p className="mt-1 text-parchment/75">Stuck, found a bug, or have an idea? Ahoy there.</p>
        </header>

        <section className="flex flex-col gap-2" aria-label="Common questions">
          <h2 className="font-pirate text-2xl text-gold">Common questions</h2>
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="rounded-xl border border-parchment/15 bg-night/40 px-4 py-3 [&_a]:text-gold [&_a]:underline"
            >
              <summary className="cursor-pointer font-semibold">{f.q}</summary>
              <p className="mt-2 text-sm text-parchment/85">{f.a}</p>
            </details>
          ))}
        </section>

        <section className="panel flex flex-col gap-4 p-5" aria-label="Contact us">
          <h2 className="font-pirate text-2xl text-gold">Send us a message</h2>
          {sent ? (
            <p role="status">
              Message in the bottle! We'll reply by email, usually within a couple of days.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Your name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  defaultValue={user?.username ?? ""}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Email, so we can reply
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  autoComplete="email"
                  defaultValue={user?.email ?? ""}
                  className={field}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                What's it about?
                <select name="topic" defaultValue="help" className={field}>
                  {Object.entries(SUPPORT_TOPICS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Message
                <textarea
                  name="message"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={6}
                  className={field}
                />
              </label>
              {/* Hidden from people; bots fill it in and their message is dropped. */}
              <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={busy}>
                Send
              </button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
