import { Link } from "wouter";
import { useAuth } from "../auth.js";
import { SettingsButton } from "./SettingsButton.js";

/** Who's signed in, and links to the crew, the Ship's Log and the account. Shared by every game. */
export function AccountBar() {
  const { user, logout } = useAuth();
  // On phones the greeting gets its own row and the links sit underneath.
  return (
    <nav
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm whitespace-nowrap"
      aria-label="Account"
    >
      {user ? (
        <>
          <span className="flex w-full items-center gap-2 text-parchment/80 sm:mr-auto sm:w-auto">
            <SettingsButton />
            Ahoy, <b className="text-gold">{user.username}</b>
          </span>
          {user.isAdmin && (
            <Link href="/admin" className="text-parchment hover:text-gold">
              Admin
            </Link>
          )}
          <Link href="/friends" className="text-parchment hover:text-gold">
            Crew
          </Link>
          <Link href="/stats" className="text-parchment hover:text-gold">
            Ship's Log
          </Link>
          <Link href="/account" className="text-parchment/70 hover:text-gold">
            Account
          </Link>
          <button
            type="button"
            className="text-parchment/70 hover:text-gold"
            onClick={() => void logout()}
          >
            Log out
          </button>
        </>
      ) : (
        <>
          <span className="mr-auto">
            <SettingsButton />
          </span>
          <Link href="/login" className="text-parchment hover:text-gold">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-gold/60 px-3 py-1 hover:bg-gold/10"
          >
            Sign up
          </Link>
        </>
      )}
    </nav>
  );
}
