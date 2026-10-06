import { useState } from "react";
import { NavBar } from "../components/NavBar.js";
import { Link } from "wouter";
import { ApiError, api } from "../api.js";
import { useAuth } from "../auth.js";
import { useEmailEnabled } from "../email.js";
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

interface Entry {
  q: string;
  a: React.ReactNode;
}

/** Common questions in three groups, most asked first in each. */
const FAQ: { group: string; items: Entry[] }[] = [
  {
    group: "Playing",
    items: [
      {
        q: "I've never played cribbage. Where do I start?",
        a: (
          <p>
            Open <Link href={CRIBBAGE_HOME}>Pirate Cribbage</Link> and tap{" "}
            <b>Learn to play with Peggy</b>. Peggy the parrot walks you through a whole hand, from
            the cut to counting the crib.
          </p>
        ),
      },
      {
        q: "Is it free?",
        a: (
          <p>
            Yes. Pirate Cribbage is free on the web and on iPhone, with no ads and no purchases. An
            account is free too.
          </p>
        ),
      },
      {
        q: "What's the difference between Classic and Pirate?",
        a: (
          <p>
            Classic is straight cribbage, first to 121. Pirate is the same game with extra pirate
            twists on top: buried treasure, the Kraken, the Black Spot and six one-use powers. Pick
            either under <b>Rules</b> before you tap <b>Set sail</b>. If you finish well ahead you
            can win with a skunk: the loser is skunked if they have fewer than 91 points when you
            reach 121, and double skunked if fewer than 61. Ranked online games are always Classic,
            with no powers.
          </p>
        ),
      },
      {
        q: "What are the pirate rules?",
        a: (
          <>
            <p>Pirate games add three twists to the board and cards:</p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                <b>Buried treasure:</b> land exactly on hole 30, 60 or 90 and dig up 3 bonus points.
              </li>
              <li>
                <b>The Kraken:</b> land exactly on hole 45, 75 or 105 and it drags you back 4.
              </li>
              <li>
                <b>The Black Spot:</b> if the Ace of Spades is cut, the player who isn't dealing
                steals the crib that hand.
              </li>
            </ul>
            <p className="mt-1">
              Choose <b>Classic</b> before you set sail if you'd rather play it straight. New to the
              whole game? Try <Link href={CRIBBAGE_HOME}>Learn to play with Peggy</Link>.
            </p>
          </>
        ),
      },
      {
        q: "What do the six powers do?",
        a: (
          <>
            <p>
              Each player can use each power once per game. In <b>Free</b> games they cost nothing;
              in <b>Plunder</b> games each use costs 2 points (you need at least 2 to use one). Tap
              a power on the table to read what it does before you use it.
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>
                <b>Spyglass:</b> peek at your opponent's hand before you discard.
              </li>
              <li>
                <b>Crow's Nest:</b> reveal the cut card before you discard; both players see it.
              </li>
              <li>
                <b>Parley:</b> before you discard, swap one card for the top card of the deck.
              </li>
              <li>
                <b>Pickpocket:</b> after the cut, give one card and take a random face-down card
                from your opponent.
              </li>
              <li>
                <b>Rebury:</b> after the cut, change which two cards you threw to the crib.
              </li>
              <li>
                <b>Belay That!:</b> take back the card you just played, before your opponent plays.
              </li>
            </ul>
            <p className="mt-1">
              You choose Free or Plunder under <b>Powers</b> when you start a Pirate game.
            </p>
          </>
        ),
      },
      {
        q: "What is the daily discard?",
        a: (
          <p>
            Every day there's a new six-card cribbage hand in the{" "}
            <Link href="/cribbage/daily">daily discard</Link>. Pick the two cards you'd throw to the
            crib and we tell you whether you found the best throw. Throw the best one on consecutive
            days to build your streak, and get the <b>Sharp Eye</b> achievement for 7 best throws in
            a row. If you're signed in, your answers and streak are saved to your account and follow
            you between the website and the iPhone app. As a guest, your streak stays on that device
            and browser only.
          </p>
        ),
      },
      {
        q: "Why did my pegs move after the hand, and can I skip the counting?",
        a: (
          <p>
            After the cards are played, each hand is counted out in turn (the player who isn't
            dealing first, then the dealer, then the crib) and your peg moves as each total is
            counted. Tap the counting panel to hurry to the next total, or tap <b>Skip</b> to jump
            straight to the totals.
          </p>
        ),
      },
      {
        q: "Can I play without an account or a connection?",
        a: (
          <p>
            Yes. Games against the computer crew work as a guest, even offline. An account keeps
            your stats, ranks and achievements and lets you play online.
          </p>
        ),
      },
    ],
  },
  {
    group: "Online and your account",
    items: [
      {
        q: "How do I play a friend?",
        a: (
          <p>
            Sign in, then under <b>Play online</b> tap <b>Invite a friend</b> and send them the
            link. The game starts as soon as they open it. You can also add them to your crew and
            challenge them when they're online. You both need a free account.
          </p>
        ),
      },
      {
        q: "My friend's invite link isn't working.",
        a: (
          <p>
            Invite links last an hour, and they only work while you're still waiting on the{" "}
            <b>Play online</b> screen. If it has expired or been cancelled, just make a new one with{" "}
            <b>Invite a friend</b> and send that. If a fresh link still doesn't work, send us a
            message below and tell us what you see.
          </p>
        ),
      },
      {
        q: "Can I sign in on the iPhone app?",
        a: (
          <p>
            Yes. The app uses the same account as the website: <Link href="/login">log in</Link>{" "}
            with your username (or email) and password, the same ones you use at deckhand.games.
            Your stats, ranks, achievements, crew and daily discard streak are the same on both. No
            account yet? <Link href="/signup">Sign up</Link> on the website or in the app; it's
            free.
          </p>
        ),
      },
      {
        q: "I forgot my password.",
        a: <ForgotPasswordAnswer />,
      },
      {
        q: "How do I change my password or email?",
        a: (
          <p>
            To change your password, sign in, open <Link href="/account">Account</Link> and use{" "}
            <b>Change password</b>: enter your current password and the new one twice. You'll be
            signed out on your other devices afterwards. To change your email, use{" "}
            <b>Change email</b> on the same page: type the new address and your current password.
            That signs you out on your other devices too.
          </p>
        ),
      },
      {
        q: "How do I delete my account?",
        a: (
          <p>
            Sign in, open <Link href="/account">Account</Link>, scroll down and choose{" "}
            <b>Delete my account</b>, then type your password to confirm. It's immediate and
            permanent. See the <Link href="/privacy">privacy policy</Link> for what's kept and for
            how long.
          </p>
        ),
      },
    ],
  },
  {
    group: "Help",
    items: [
      {
        q: "How do I report a bug?",
        a: (
          <p>
            Use the <a href="#contact">form below</a> and choose <b>Something's broken</b>. The more
            you can tell us, the faster we can find it: whether you were on the iPhone app or the
            website; your device and software (for example iPhone 14 with iOS 18, or a laptop with
            Chrome); whether you were playing the computer or a friend; what you did step by step,
            what you expected, and what happened instead (including any message on the screen). A
            screenshot is a big help. We usually reply by email within a couple of days.
          </p>
        ),
      },
    ],
  },
];

/** The reset link only exists when this server can send email; otherwise we reset it by hand. */
function ForgotPasswordAnswer() {
  const emailEnabled = useEmailEnabled();
  return emailEnabled ? (
    <p>
      Use <Link href="/forgot">Forgot your password?</Link> on the sign-in page to get a reset link
      by email; the link works for an hour. If that doesn't arrive (check spam first) or you don't
      see the link, send us a message below.
    </p>
  ) : (
    <p>
      Send us a message using the form below, with your username and the email on your account, and
      we'll help you get back in.
    </p>
  );
}

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
          {FAQ.map(({ group, items }) => (
            <section key={group} className="flex flex-col gap-2" aria-label={group}>
              <h3 className="mt-2 text-sm font-semibold tracking-wide text-gold uppercase">
                {group}
              </h3>
              {items.map((f) => (
                <details
                  key={f.q}
                  className="rounded-xl border border-parchment/15 bg-night/40 px-4 py-3 [&_a]:text-gold [&_a]:underline"
                >
                  <summary className="cursor-pointer font-semibold">{f.q}</summary>
                  {/* Answers bring their own paragraphs (and lists). */}
                  <div className="mt-2 text-sm text-parchment/85">{f.a}</div>
                </details>
              ))}
            </section>
          ))}
        </section>

        <section id="contact" className="panel flex flex-col gap-4 p-5" aria-label="Contact us">
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
