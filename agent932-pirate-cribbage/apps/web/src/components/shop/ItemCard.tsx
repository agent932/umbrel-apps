import { useId } from "react";
import type { ShopItem } from "../../api.js";
import { resolveBoard } from "../../brand/boardSkins.js";
import { resolveDeck } from "../../brand/deckSkins.js";
import { isNativeApp } from "../../native.js";
import { DoubloonIcon } from "../Doubloons.js";
import { BackPreview } from "./BackPreview.js";
import { BoardPreview } from "./BoardPreview.js";

/** 1500 → "1,500", in the player's own way of writing numbers. */
export const amount = (n: number) => n.toLocaleString();

/** Whether this build has the item's art (a newer server can sell one it lacks). */
export const hasArt = (item: ShopItem) =>
  !(item.type === "board" ? resolveBoard(item.id) : resolveDeck(item.id)).fallback;

/** The note on an item whose art this build lacks: the app bundles its art, the web reloads it. */
export const missingArt = () =>
  isNativeApp ? "Update the app to see this item" : "Reload the page to see this item";

/** The item's preview: the board lying across the card, or the back on its own. */
export function ItemPreview({ item, large = false }: { item: ShopItem; large?: boolean }) {
  if (item.type === "board") return <BoardPreview itemId={item.id} />;
  return (
    <div aria-hidden inert className="flex justify-center">
      <BackPreview itemId={item.id} className={large ? "w-32" : "w-24"} />
    </div>
  );
}

interface ItemCardProps {
  item: ShopItem;
  /**
   * "guest": prices only, no button. "shop": buy and use. "owned": the closed shop's list of what
   * you own, with no prices and no Buy.
   */
  mode: "guest" | "shop" | "owned";
  /** You own it: bought, or free (everyone owns the free items). */
  owned: boolean;
  inUse: boolean;
  /** Your doubloons. */
  balance: number;
  /** Your Use for this item is on its way. */
  switching: boolean;
  /** Buy was pressed: open the confirm sheet, which gives focus back to this button. */
  onBuy: (button: HTMLButtonElement) => void;
  onUse: () => void;
}

/**
 * One board or card back. Each card has one button, the same element whatever its job (Buy, Use
 * it, In use, Switching…), so focus never falls off the page when the job changes. It's never
 * `disabled` (Safari drops focus from a disabled button): it says aria-disabled and does nothing.
 */
export function ItemCard({
  item,
  mode,
  owned,
  inUse,
  balance,
  switching,
  onBuy,
  onUse,
}: ItemCardProps) {
  const id = useId();
  const art = hasArt(item);
  const price = `${amount(item.price)} doubloons`;
  const need = item.price - balance;
  const forSale = mode === "shop" && !owned && item.price > 0;
  const short = forSale && need > 0;

  // What the one button does now, its words, and its full name for screen readers.
  const action = mode === "guest" ? null : inUse ? "inUse" : owned ? "use" : forSale ? "buy" : null;
  const cantBuy = action === "buy" && (short || !art);
  const notes = [!art && `${id}-art`, short && `${id}-short`].filter(Boolean).join(" ");
  const off = action === "inUse" || switching || cantBuy;

  return (
    <article aria-labelledby={`${id}-name`} className="panel flex flex-col gap-3 p-4">
      <ItemPreview item={item} />
      {!art && (
        <p id={`${id}-art`} className="text-center text-sm text-parchment/80">
          {missingArt()}
        </p>
      )}
      <div className="flex flex-col gap-1">
        <h3 id={`${id}-name`} className="font-pirate text-2xl text-gold">
          {item.name}
        </h3>
        <p className="text-sm text-parchment/85">{item.description}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* What it is to you, always in words. */}
        <p className="inline-flex items-center gap-1.5 font-semibold">
          {item.price === 0 ? (
            "Free"
          ) : owned ? (
            "Owned"
          ) : (
            <>
              <DoubloonIcon className="h-4 w-4 shrink-0" />
              <span className="num text-gold">{price}</span>
            </>
          )}
        </p>
        {action && (
          <button
            type="button"
            className={`min-h-11 ${
              action === "buy"
                ? "btn-primary"
                : action === "use"
                  ? "btn-secondary"
                  : "rounded-xl border border-parchment/25 px-5 py-2.5 font-bold text-parchment/80"
            } aria-disabled:cursor-not-allowed ${cantBuy ? "aria-disabled:opacity-50" : ""}`}
            // Each name holds the words on the button, so voice control finds it ("Tap Use it").
            aria-label={
              switching
                ? `Switching to ${item.name}…`
                : action === "buy"
                  ? `Buy ${item.name} for ${price}`
                  : action === "use"
                    ? `Use it: ${item.name}`
                    : `In use: ${item.name}`
            }
            aria-disabled={off || undefined}
            aria-busy={switching || undefined}
            aria-describedby={(action === "buy" && notes) || undefined}
            onClick={(e) => {
              if (off) return;
              if (action === "buy") onBuy(e.currentTarget);
              else if (action === "use") onUse();
            }}
          >
            {switching ? (
              "Switching…"
            ) : action === "buy" ? (
              "Buy"
            ) : action === "use" ? (
              "Use it"
            ) : (
              <>
                <span aria-hidden>✓</span> In use
              </>
            )}
          </button>
        )}
      </div>
      {short && (
        <p id={`${id}-short`} className="text-right text-sm text-parchment/75">
          {amount(need)} more doubloons needed
        </p>
      )}
    </article>
  );
}
