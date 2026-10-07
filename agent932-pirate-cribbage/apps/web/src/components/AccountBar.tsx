import { Link } from "wouter";
import { useAuth } from "../auth.js";
import { SHOP } from "../routes.js";
import { DoubloonIcon } from "./Doubloons.js";
import { SettingsButton } from "./SettingsButton.js";

/** Back to the Deckhand Games hub. */
function HomeLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 text-parchment hover:text-gold">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="currentColor">
        <path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z" />
      </svg>
      Home
    </Link>
  );
}

/**
 * The shop, once it's open to players. Admins always see it: while it's closed it's their preview.
 */
function ShopLink({ preview }: { preview: boolean }) {
  return (
    <Link href={SHOP} className="text-parchment hover:text-gold">
      {preview ? "Shop (preview)" : "Shop"}
    </Link>
  );
}

/**
 * Who's signed in, and links to the shop, the crew, the Ship's Log and the account. Shared by
 * every game; inside a game, `home` adds a link back to the Deckhand Games hub.
 */
export function AccountBar({ home = false }: { home?: boolean }) {
  const { user, logout, shopOpen } = useAuth();
  const preview = !shopOpen && !!user?.isAdmin;
  // On phones the greeting gets its own row and the links sit underneath.
  return (
    <nav
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm whitespace-nowrap"
      aria-label="Account"
    >
      {user ? (
        <>
          <span className="flex w-full min-w-0 items-center gap-2 text-parchment/80 sm:mr-auto sm:w-auto">
            <SettingsButton />
            Ahoy,{" "}
            {/* A long name gives way (…) before the balance does, so the row fits a phone. */}
            <b className="min-w-0 truncate text-gold" title={user.username}>
              {user.username}
            </b>
            {/* Your doubloons (read again from the server after each game and daily puzzle). */}
            <span
              className="ml-1 inline-flex shrink-0 items-center gap-1 font-semibold text-gold tabular-nums"
              title="Doubloons"
            >
              <DoubloonIcon className="h-4 w-4" />
              {(user.doubloons ?? 0).toLocaleString()}
              <span className="sr-only"> doubloons</span>
            </span>
          </span>
          {home && <HomeLink />}
          {user.isAdmin && (
            <Link href="/admin" className="text-parchment hover:text-gold">
              Admin
            </Link>
          )}
          {(shopOpen || preview) && <ShopLink preview={preview} />}
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
          {home && <HomeLink />}
          {shopOpen && <ShopLink preview={false} />}
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
