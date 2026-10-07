import type { RuleSet } from "@pirate/engine";
import { useCosmetics } from "../../brand/cosmetics.js";
import { PaintedBoard } from "./PaintedBoard.js";
import { useUpright } from "./tableHooks.js";

/**
 * The board's spot on the table: upright down the side in landscape, lying across in portrait.
 * It draws the board in CosmeticsContext: yours, or the host's in an online game.
 */
export function TableBoard(props: {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  me: 0 | 1;
  instant?: boolean;
}) {
  const upright = useUpright();
  const { board } = useCosmetics();
  return (
    <div className="t-board">
      <PaintedBoard {...props} upright={upright} skinId={board} />
    </div>
  );
}
