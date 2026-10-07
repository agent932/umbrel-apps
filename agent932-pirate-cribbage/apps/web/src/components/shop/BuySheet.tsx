import { type RefObject, useEffect, useId, useRef, useState } from "react";
import { ApiError, type ShopItem } from "../../api.js";
import { DoubloonIcon } from "../Doubloons.js";
import { dialogProps, useDialog } from "../useDialog.js";
import { ItemPreview, amount } from "./ItemCard.js";

interface BuySheetProps {
  /** The item, as the shop last read it (a reload after a price change brings the new price). */
  item: ShopItem;
  /** Your doubloons. */
  balance: number;
  /** The card's button: focus goes back to it when the sheet closes. */
  opener: RefObject<HTMLElement | null>;
  /** Buy at this price (the one shown). Rejects with the server's error, after the shop has been
   *  read again (and resolves if that shows the item is yours after all). */
  onBuy: (price: number) => Promise<void>;
  /** Use the item. Rejects with the server's error. */
  onUse: () => Promise<void>;
  onClose: () => void;
}

/** What a failed buy or use says: the server's own words, or that it couldn't be reached. */
export const failureText = (error: unknown) =>
  error instanceof ApiError ? error.message : "Couldn't reach the shop. Try again.";

/**
 * "Buy Treasure Map?": the one confirm step before doubloons are spent (purchases can't be
 * undone). Buying doesn't switch the item on; the sheet then offers "Use it now". Its buttons are
 * never `disabled` while busy (Safari would drop focus): they say aria-disabled and aria-busy.
 */
export function BuySheet({ item, balance, opener, onBuy, onUse, onClose }: BuySheetProps) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const useNow = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<"confirm" | "buying" | "bought" | "using">("confirm");
  /** What went wrong last, and the price that try was sent with. */
  const [failure, setFailure] = useState<{ error: unknown; asked: number } | null>(null);
  const busy = phase === "buying" || phase === "using";
  // Nothing closes it while a purchase or a switch is on its way, Escape included: it would go
  // through with nobody told.
  const close = () => {
    if (!busy) onClose();
  };
  useDialog(panel, { onClose: close, opener });

  // Bought: on to "Use it now" (the confirm button it replaces is gone).
  useEffect(() => {
    if (phase === "bought") useNow.current?.focus();
  }, [phase]);

  const price = item.price;
  const left = balance - price;
  const done = phase === "bought" || phase === "using";
  // The price changed since the sheet opened, and the shop has been read again with the new one.
  const repriced =
    failure?.error instanceof ApiError &&
    failure.error.code === "priceChanged" &&
    failure.asked !== price;

  async function confirm() {
    if (phase !== "confirm" || left < 0) return;
    setPhase("buying");
    setFailure(null);
    try {
      await onBuy(price);
      setPhase("bought");
    } catch (error) {
      setFailure({ error, asked: price });
      setPhase("confirm");
    }
  }

  async function switchNow() {
    if (phase !== "bought") return;
    setPhase("using");
    setFailure(null);
    try {
      await onUse();
      onClose();
    } catch (error) {
      setFailure({ error, asked: price });
      setPhase("bought");
    }
  }

  return (
    <div className="dialog-shade z-50 bg-black/55">
      <div
        ref={panel}
        {...dialogProps(done ? `${item.name} is yours` : `Buy ${item.name}?`)}
        // A phone held sideways puts the preview beside the words, so Cancel stays in view.
        className="panel flex w-full max-w-md flex-col gap-4 p-5 text-parchment [@media(orientation:landscape)_and_(max-height:480px)]:max-w-2xl [@media(orientation:landscape)_and_(max-height:480px)]:flex-row [@media(orientation:landscape)_and_(max-height:480px)]:items-center"
      >
        <div className="[@media(orientation:landscape)_and_(max-height:480px)]:w-1/2 [@media(orientation:landscape)_and_(max-height:480px)]:shrink-0">
          <ItemPreview item={item} large />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* There from the start and only filled in, so "is yours" is announced. */}
          <p
            id={`${id}-done`}
            role="status"
            className={done ? "font-pirate text-3xl text-gold" : "sr-only"}
          >
            {done ? `${item.name} is yours.` : ""}
          </p>
          {!done && <h2 className="font-pirate text-3xl text-gold">Buy {item.name}?</h2>}
          {done ? (
            <p>You have {amount(balance)} doubloons left.</p>
          ) : left < 0 ? (
            <p>
              {amount(price)} doubloons. You have {amount(balance)}, so you need {amount(-left)}{" "}
              more.
            </p>
          ) : (
            <p>
              {amount(price)} doubloons. You have {amount(balance)}, so you'll have {amount(left)}{" "}
              left. Purchases can't be undone.
            </p>
          )}
          {failure && (
            <p role="alert" className="text-red-300">
              {repriced
                ? `The price is now ${amount(price)} doubloons.`
                : failureText(failure.error)}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {done ? (
              <>
                <button
                  ref={useNow}
                  type="button"
                  className="btn-primary min-h-11"
                  aria-disabled={busy || undefined}
                  aria-busy={busy || undefined}
                  // Focus lands here as it's bought: it reads out that the item is yours.
                  aria-describedby={`${id}-done`}
                  onClick={() => void switchNow()}
                >
                  {phase === "using" ? "Switching…" : "Use it now"}
                </button>
                <button
                  type="button"
                  className={QUIET}
                  aria-disabled={busy || undefined}
                  onClick={close}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 aria-disabled:cursor-not-allowed"
                  aria-disabled={busy || left < 0 || undefined}
                  aria-busy={busy || undefined}
                  onClick={() => void confirm()}
                >
                  {busy ? (
                    "Buying…"
                  ) : (
                    <>
                      <DoubloonIcon className="h-5 w-5 shrink-0" />
                      Buy for {amount(price)} doubloons
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={QUIET}
                  aria-disabled={busy || undefined}
                  onClick={close}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Close and Cancel: plain text buttons. */
const QUIET =
  "min-h-11 text-parchment/80 hover:text-gold aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
