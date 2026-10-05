// Writes the board skins' JSON (apps/web/src/brand/boards/*.json): each board's art with its hole
// map laid out by boardTrack.ts. Re-run after changing a layout:
//   npx tsx scripts/board-skins.ts && npx prettier --write apps/web/src/brand/boards
import { writeFileSync } from "node:fs";
import {
  SERPENT_REEF,
  classicSerpentLanes,
  serpentReefLanes,
} from "../apps/web/src/brand/boardTrack.ts";

const write = (id: string, skin: object) =>
  writeFileSync(
    new URL(`../apps/web/src/brand/boards/${id}.json`, import.meta.url),
    JSON.stringify(skin, null, 2) + "\n",
  );

const [left, right] = classicSerpentLanes();
write("classic-serpent", {
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
});

const [outer, inner] = serpentReefLanes();
write("serpent-reef", {
  id: "serpent-reef",
  name: "Serpent Reef",
  version: 1,
  author: "Deckhand Games",
  upright: {
    image: "board-serpent.webp",
    size: SERPENT_REEF.size,
    lanes: [
      { name: "outer", holes: outer },
      { name: "inner", holes: inner },
    ],
    sharedGameHole: true,
    holeRadius: 0.0125,
    pegRadius: 0.02,
    pegSprite: { me: "peg-blue.webp", opponent: "peg-red.webp", size: [72, 199], height: 0.13 },
    safeBox: [0.08, 0.03, 0.92, 0.96],
  },
});
