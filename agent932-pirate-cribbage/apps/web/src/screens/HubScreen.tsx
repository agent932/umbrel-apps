import { Link } from "wouter";
import { AccountBar } from "../components/AccountBar.js";
import { Peggy } from "../brand/Peggy.js";
import { CRIBBAGE_HOME } from "../routes.js";
import cribbageLogoUrl from "../assets/ui/logo-a.webp";
import harbourUrl from "../assets/ui/home-land.webp";

/** deckhand.games: the games on offer. Pirate Cribbage is the first. */
export function HubScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6">
      <AccountBar />
      <header className="flex flex-col items-center text-center">
        <Peggy bob className="mb-1 h-24 w-auto drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" />
        <h1 className="font-pirate text-5xl text-gold lantern-glow sm:text-6xl">Deckhand Games</h1>
        <p className="mt-2 text-parchment/85">Card games on the high seas. Pick a table, matey.</p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2" aria-label="Games">
        <li>
          <Link
            href={CRIBBAGE_HOME}
            className="panel group flex h-full flex-col overflow-hidden transition hover:-translate-y-1"
          >
            <span
              className="relative grid h-40 place-items-center bg-cover bg-center"
              style={{ backgroundImage: `url("${harbourUrl}")` }}
            >
              <img
                src={cribbageLogoUrl}
                alt=""
                className="h-28 w-auto drop-shadow-[0_8px_12px_rgba(0,0,0,0.7)] transition group-hover:scale-105"
              />
            </span>
            <span className="flex flex-1 flex-col gap-1 p-4">
              <span className="font-pirate text-2xl text-gold">Pirate Cribbage</span>
              <span className="text-sm text-parchment/85">
                The classic two-player card game, with an optional pirate twist: buried treasure,
                the Kraken and six sneaky powers. Play the crew or a friend online.
              </span>
              <span className="btn-primary mt-3 self-start">Play</span>
            </span>
          </Link>
        </li>
        <li className="panel flex flex-col items-center justify-center gap-2 p-6 text-center opacity-80">
          <span className="font-pirate text-2xl text-parchment">More games coming</span>
          <span className="text-sm text-parchment/75">
            The crew are shuffling the next deck. Your account, friends and Ship's Log will carry
            over to every game.
          </span>
        </li>
      </ul>
      <footer className="mt-auto text-center text-sm text-parchment/60">
        <Link href="/privacy" className="hover:text-gold">
          Privacy policy
        </Link>
      </footer>
    </main>
  );
}
