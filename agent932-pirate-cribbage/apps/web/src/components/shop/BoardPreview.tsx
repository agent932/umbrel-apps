import { CLASSIC_RULES } from "@pirate/engine";
import { resolveBoard } from "../../brand/boardSkins.js";
import { PaintedBoard } from "../table/PaintedBoard.js";

/**
 * A board lying on its side, as on a phone held upright, with both players' pegs part way round.
 * Decoration only (the card's text says what it is), and inert, so a dialog showing it never
 * counts its images (`<image href>`) as places for focus. An item this build lacks draws the
 * default.
 */
export function BoardPreview({ itemId }: { itemId: string }) {
  const [w, h] = resolveBoard(itemId).skin.upright.size;
  return (
    <div aria-hidden inert className="w-full" style={{ aspectRatio: `${h} / ${w}` }}>
      <PaintedBoard
        skinId={itemId}
        upright={false}
        // Pegs that don't hop (or tick) every time the shop draws.
        instant
        scores={[38, 52]}
        backPegs={[30, 47]}
        rules={CLASSIC_RULES}
        names={["", ""]}
        me={1}
      />
    </div>
  );
}
