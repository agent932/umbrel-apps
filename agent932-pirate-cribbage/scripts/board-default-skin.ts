// Writes the default board skin (apps/web/src/brand/boards/classic-serpent.json): board.webp with a
// continuous track per lane laid out by boardTrack.ts. Re-run after changing that layout:
//   npx tsx scripts/board-default-skin.ts && npx prettier --write apps/web/src/brand/boards
import { writeFileSync } from "node:fs";
import { classicSerpentLanes } from "../apps/web/src/brand/boardTrack.ts";

const [left, right] = classicSerpentLanes();
const skin = {
  id: "classic-serpent",
  name: "Classic Serpent",
  version: 1,
  author: "Deckhand Games",
  upright: {
    image: "board.webp",
    size: [700, 1400],
    lanes: [
      { name: "left", holes: left },
      { name: "right", holes: right },
    ],
    holeRadius: 0.0071,
    pegRadius: 0.0179,
    safeBox: [0.2, 0.12, 0.8, 0.88],
  },
};

writeFileSync(
  new URL("../apps/web/src/brand/boards/classic-serpent.json", import.meta.url),
  JSON.stringify(skin, null, 2) + "\n",
);
