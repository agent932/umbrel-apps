import { Link } from "wouter";

/** What the game keeps about you, and how to get rid of it. Linked from Account and the hub. */
export function PrivacyScreen() {
  const h2 = "font-pirate text-2xl text-gold";
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-6 text-parchment/90">
      <Link href="/" className="text-sm text-parchment/70 hover:text-gold">
        ← Deckhand Games
      </Link>
      <h1 className="text-center font-pirate text-4xl text-gold">Privacy policy</h1>
      <p className="text-center text-sm text-parchment/60">Last updated 4 October 2026</p>

      <p>
        Deckhand Games is a small, self-hosted card game site. It has no ads, does not track you
        across other sites or apps, and never sells or shares your information.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>What we keep</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Your account:</b> username, email address, and your password stored only as a salted
            scrypt hash (we can't read it). Your chosen crew portrait.
          </li>
          <li>
            <b>Your games:</b> match results, scores, hands and plays, ratings and ranks, and
            achievements. These power your stats, the Ship's Log and the leaderboard.
          </li>
          <li>
            <b>Friends:</b> who you've added and pending requests.
          </li>
          <li>
            <b>Email settings:</b> which optional notices you've switched on.
          </li>
          <li>
            <b>Sign-in:</b> a session cookie that keeps you signed in. It's the only cookie we set.
          </li>
          <li>
            <b>On your device only:</b> game settings, the daily discard streak and a guest game in
            progress are kept in your browser's storage and never sent to us.
          </li>
        </ul>
        <p>
          Playing as a guest against the computer needs no account and stores nothing on the server.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Who else sees it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Other players</b> see your username, portrait, rank and rating, and in-game moves and
            emotes. Your email address is never shown to other players.
          </li>
          <li>
            <b>Email delivery:</b> if the site owner has turned email on, invites, password resets
            and the notices you opt into are sent through Resend (resend.com), which receives the
            recipient address and the message.
          </li>
          <li>
            <b>Hosting:</b> the site runs on its owner's own server behind Cloudflare, which handles
            the connection and may count page views without cookies (Cloudflare Web Analytics). Your
            IP address is used briefly to limit sign-in attempts and isn't stored.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>How long we keep it</h2>
        <p>
          Until you delete your account. Daily backups of the database are kept for 14 days, then
          removed.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Deleting your account</h2>
        <p>
          Sign in, open <b>Account</b>, and choose <b>Delete account</b>. Your account, friends,
          stats, achievements and unfinished games are removed straight away. Finished matches stay
          in your opponents' history without your name. You can also change your password or turn
          off email notices there at any time.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Children</h2>
        <p>The game isn't aimed at children under 13, and we don't knowingly collect their data.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Questions</h2>
        <p>
          Open an issue at{" "}
          <a
            className="text-gold underline"
            href="https://github.com/agent932/umbrel-apps/issues"
            target="_blank"
            rel="noreferrer"
          >
            github.com/agent932/umbrel-apps/issues
          </a>
          .
        </p>
      </section>
    </main>
  );
}
