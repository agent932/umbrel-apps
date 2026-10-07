import { resolveDeck } from "../../brand/deckSkins.js";

/**
 * A card back on its own, with a card's rounded corners and the back's field colour under the art.
 * No faces: they look the same with every back. Decoration only, like the board preview.
 */
export function BackPreview({
  itemId,
  className = "w-24",
}: {
  itemId: string;
  className?: string;
}) {
  const { skin } = resolveDeck(itemId);
  return (
    <img
      src={skin.backUrl}
      alt=""
      aria-hidden
      data-deck={skin.id}
      className={`aspect-[268/420] h-auto shrink-0 rounded-lg object-cover shadow-[0_4px_10px_-2px_rgba(0,0,0,0.55)] ${className}`}
      style={{ backgroundColor: skin.backColor }}
    />
  );
}
