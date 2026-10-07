import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type Cosmetics, DEFAULT_COSMETICS, ITEM_TYPES, type ItemType } from "@pirate/engine";
import { ApiError, type ShopItem, type ShopResponse, api } from "../api.js";
import { useAuth } from "../auth.js";
import { preloadCosmetics } from "../brand/preloadSkins.js";
import { DoubloonIcon, EarnHint } from "../components/Doubloons.js";
import { NavBar } from "../components/NavBar.js";
import { BuySheet, failureText } from "../components/shop/BuySheet.js";
import { ItemCard, amount } from "../components/shop/ItemCard.js";
import { CRIBBAGE_HOME } from "../routes.js";

type Load =
  | { kind: "loading" }
  /** `retrying`: Try again was pressed, and the shop hasn't answered yet. */
  | { kind: "failed"; retrying?: boolean }
  | { kind: "ready"; shop: ShopResponse };

/** A server without the shop (404) shows it as not open yet. */
const NO_SHOP: ShopResponse = { open: false, items: [] };

/** How long "Treasure Map is now in use" (or what went wrong) stays on screen. */
const NOTICE_MS = 4000;

/** A type this build knows: a newer server may sell things it can't draw (pegs, say). */
const known = (item: ShopItem): item is ShopItem & { type: ItemType } =>
  (ITEM_TYPES as readonly string[]).includes(item.type);

/**
 * The shop: boards and card backs, bought with doubloons and used at every table you host. While
 * it's closed to players it says it opens soon and lists what you own (so you can still switch);
 * admins see all of it as a preview. Guests can look but not buy.
 */
export function ShopScreen() {
  const { user, loading, refresh } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  /** The item whose confirm sheet is open, and the card button that opened it. */
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  /** The page's heading, which takes focus when the element that had it goes away. */
  const heading = useRef<HTMLHeadingElement>(null);
  /** Set when the next render may take away the element that has focus (see below). */
  const refocus = useRef(false);

  useEffect(() => {
    let live = true;
    const done = (next: Load) => {
      if (!live) return;
      // After Try again: the shop takes that button's place, so focus goes to the heading.
      if (attempt > 0) refocus.current = true;
      setLoad(next);
    };
    api<ShopResponse>("/api/shop").then(
      (shop) => done({ kind: "ready", shop }),
      (e) =>
        done(
          e instanceof ApiError && e.status === 404
            ? { kind: "ready", shop: NO_SHOP }
            : { kind: "failed" },
        ),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  // Never leave focus on <body>: when the element that had it has gone (the Try again button once
  // the shop loads, the confirm sheet over an item that's no longer for sale), it goes to the
  // heading, so a keyboard or VoiceOver user carries on from the top of the shop.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) heading.current?.focus();
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const patch = useCallback(
    (change: Partial<ShopResponse>) =>
      setLoad((l) => (l.kind === "ready" ? { kind: "ready", shop: { ...l.shop, ...change } } : l)),
    [],
  );
  /** Read the shop again behind the page (a new price, a new balance), keeping it on screen.
   *  Gives what it read, or null if it couldn't. */
  const reload = useCallback(
    () =>
      api<ShopResponse>("/api/shop").then(
        (shop) => {
          setLoad({ kind: "ready", shop });
          return shop;
        },
        () => null,
      ),
    [],
  );

  if (loading || load.kind === "loading")
    return (
      <Shell heading={heading}>
        <p className="text-center text-parchment/60">Opening the shop…</p>
      </Shell>
    );
  if (load.kind === "failed") {
    const retrying = load.retrying === true;
    return (
      <Shell heading={heading}>
        <div className="flex flex-col items-center gap-3 text-center">
          {/* Emptied while it tries again, so a second failure is announced too. */}
          <p role="alert" className="min-h-6 text-red-300">
            {retrying ? "" : "Couldn't reach the shop"}
          </p>
          {/* Stays on the page while it tries, so focus stays on it. */}
          <button
            type="button"
            className="btn-secondary min-h-11 aria-disabled:cursor-not-allowed"
            aria-disabled={retrying || undefined}
            aria-busy={retrying || undefined}
            onClick={() => {
              if (retrying) return;
              setLoad({ kind: "failed", retrying: true });
              setAttempt((n) => n + 1);
            }}
          >
            {retrying ? "Trying again…" : "Try again"}
          </button>
        </div>
      </Shell>
    );
  }

  const { shop } = load;
  const visible = shop.open || shop.preview === true;
  const items = shop.items.filter(known);
  const balance = shop.doubloons ?? 0;
  const mine = new Set(shop.owned ?? []);
  const equipped: Cosmetics = shop.equipped ?? DEFAULT_COSMETICS;
  const mode = !user ? "guest" : visible ? "shop" : "owned";

  /** Buy at the price shown. A charged purchase must never look failed: a buy that fails is
   *  checked against the shop before it's called a failure, and the account bar's balance is
   *  read again only as a best effort. */
  async function buy(item: ShopItem, price: number) {
    try {
      const r = await api<{ doubloons: number; owned: string[] }>("/api/shop/buy", {
        body: { itemId: item.id, price },
      });
      patch({ doubloons: r.doubloons, owned: r.owned });
    } catch (e) {
      // A new price, a new balance, an item gone: read the shop again before saying why.
      const now = await reload();
      // Unless it's yours now: the purchase went through and only its reply was lost (the signal
      // dropped, a gateway timed out), or it was bought already.
      if (!now?.owned?.includes(item.id)) {
        if (offSale(now, item, e)) {
          // Nothing left to buy, and its card may be gone with it: close the sheet and say why.
          refocus.current = true;
          setBuying(null);
          setNotice({ ok: false, text: failureText(e) });
        }
        throw e;
      }
    }
    void refresh().catch(() => {});
  }

  /** Use an item from now on. The next table you sit at (or host) draws it. */
  async function switchTo(item: ShopItem & { type: ItemType }) {
    setSwitching(item.id);
    setNotice(null);
    // Its art is fetched now, so the next table opens on it.
    void preloadCosmetics({ ...equipped, [item.type]: item.id });
    try {
      const r = await api<{ equipped: Cosmetics }>("/api/shop/use", { body: { itemId: item.id } });
      patch({ equipped: r.equipped });
      // So your own tables (ViewerCosmetics) change too.
      void refresh().catch(() => {});
      setNotice({ ok: true, text: `${item.name} is now in use` });
    } catch (e) {
      void reload();
      throw e;
    } finally {
      setSwitching(null);
    }
  }

  const card = (item: ShopItem & { type: ItemType }) => (
    <ItemCard
      key={item.id}
      item={item}
      mode={mode}
      owned={mine.has(item.id) || item.price === 0}
      inUse={equipped[item.type] === item.id}
      balance={balance}
      switching={switching === item.id}
      onBuy={(button) => {
        opener.current = button;
        setBuying(item);
      }}
      onUse={() => {
        if (switching) return;
        switchTo(item).catch((e: unknown) => setNotice({ ok: false, text: failureText(e) }));
      }}
    />
  );
  const grid = (list: (ShopItem & { type: ItemType })[]) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{list.map(card)}</div>
  );
  // The open sheet's item as the shop last read it (its price may have changed).
  const sheetItem = buying && (items.find((i) => i.id === buying.id) ?? buying);

  return (
    <Shell heading={heading}>
      {visible ? (
        <>
          {user && (
            <p className="flex items-center justify-center gap-2 text-lg">
              <DoubloonIcon className="h-6 w-6 shrink-0" />
              <span>You have {amount(balance)} doubloons</span>
            </p>
          )}
          <p className="text-center text-sm text-parchment/80">
            Doubloons are earned by playing: wins, the daily discard and achievements. They can't be
            bought, and nothing here costs real money.
          </p>
          {shop.preview ? (
            <p className="rounded-xl border border-gold/60 bg-gold/10 p-3 text-center text-sm">
              Preview: only admins can see the shop until it opens (Admin → Shop).
            </p>
          ) : (
            !user && <EarnHint />
          )}
          <section className="flex flex-col gap-3" aria-labelledby="shop-boards">
            <h2 id="shop-boards" className="font-pirate text-3xl text-gold">
              Boards
            </h2>
            <p className="text-sm text-parchment/80">
              In online games both players see the host's board and card backs: the player who sent
              the invite or challenge, or who was waiting first in quick match.
            </p>
            {grid(items.filter((i) => i.type === "board"))}
          </section>
          <section className="flex flex-col gap-3" aria-labelledby="shop-backs">
            <h2 id="shop-backs" className="font-pirate text-3xl text-gold">
              Card backs
            </h2>
            <p className="text-sm text-parchment/80">
              A card back changes the back of every card. The faces stay the same.
            </p>
            {grid(items.filter((i) => i.type === "deck"))}
          </section>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-center">
            <p className="text-lg">The shop opens soon.</p>
            {user && (
              <p className="text-parchment/80">Keep earning: your doubloons will be waiting.</p>
            )}
          </div>
          {!user && <EarnHint />}
          {user && items.length > 0 && (
            <section className="flex flex-col gap-3" aria-labelledby="shop-yours">
              <h2 id="shop-yours" className="font-pirate text-3xl text-gold">
                Your boards and card backs
              </h2>
              {grid(items)}
            </section>
          )}
        </>
      )}

      {/* "Treasure Map is now in use", or why a switch failed. Always here, so it's announced. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p role="status" className={notice?.ok ? TOAST : "sr-only"}>
          {notice?.ok ? notice.text : ""}
        </p>
        <p role="alert" className={notice && !notice.ok ? `${TOAST} text-red-300` : "sr-only"}>
          {notice && !notice.ok ? notice.text : ""}
        </p>
      </div>

      {sheetItem && (
        <BuySheet
          item={sheetItem}
          balance={balance}
          opener={opener}
          onBuy={(price) => buy(sheetItem, price)}
          onUse={() => (known(sheetItem) ? switchTo(sheetItem) : Promise.resolve())}
          onClose={() => setBuying(null)}
        />
      )}
    </Shell>
  );
}

const TOAST =
  "rounded-xl border border-gold/60 bg-night/95 px-4 py-2 text-center text-sm shadow-lg";

/**
 * Whether a buy failed because the item can't be bought here any more: the shop closed, or the
 * item went off sale. `now` is the shop read again since (null if it couldn't be).
 */
function offSale(now: ShopResponse | null, item: ShopItem, error: unknown) {
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === "closed" || code === "unknown") return true;
  return !!now && !((now.open || now.preview) && now.items.some((i) => i.id === item.id));
}

/** The page around every state of the shop. Its heading takes focus when nothing else has it. */
function Shell({
  heading,
  children,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <>
      <NavBar title="Shop" back={{ to: CRIBBAGE_HOME, label: "Harbour" }} />
      <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-5 px-4 pt-2 pb-6">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-center font-pirate text-4xl text-gold outline-none"
        >
          Shop
        </h1>
        {children}
      </main>
    </>
  );
}
