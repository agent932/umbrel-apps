import type { RuleSet } from "@pirate/engine";
import { PaintedBoard } from "./PaintedBoard.js";
import { useUpright } from "./tableHooks.js";

/** The board's spot on the table: upright down the side in landscape, lying across in portrait. */
export function TableBoard(props: {
  scores: [number, number];
  backPegs: [number, number];
  rules: RuleSet;
  names: [string, string];
  me: 0 | 1;
  instant?: boolean;
}) {
  const upright = useUpright();
  return (
    <div className="t-board">
      <PaintedBoard {...props} upright={upright} />
    </div>
  );
}
