// Board skins: a board is an image plus a JSON hole map, so a new board needs no code. The map
// gives each player's lane 122 holes (index = score: 0 is the start pocket, 121 the game hole) as
// fractions of the image, and the hole and peg sizes as fractions of the image's width.
// A skin that fails validation falls back to the default board.
// A board's key is its shop item id ("board.treasure-map") or its bare skin id ("treasure-map").
import type { HolePoint } from "./boardTrack.js";
import classicSerpent from "./boards/classic-serpent.json";
import ghostShip from "./boards/ghost-ship.json";
import krakensReef from "./boards/krakens-reef.json";
import royalNavy from "./boards/royal-navy.json";
import serpentReef from "./boards/serpent-reef.json";
import treasureMap from "./boards/treasure-map.json";
import classicSerpentBoardUrl from "../assets/table/board.webp";
import ghostShipBoardUrl from "../assets/table/board-ghost-ship.webp";
import krakensReefBoardUrl from "../assets/table/board-krakens-reef.webp";
import royalNavyBoardUrl from "../assets/table/board-royal-navy.webp";
import serpentReefBoardUrl from "../assets/table/board-serpent.webp";
import treasureMapBoardUrl from "../assets/table/board-treasure-map.webp";
import pegBlueUrl from "../assets/table/peg-blue.webp";
import pegRedUrl from "../assets/table/peg-red.webp";

export type { HolePoint };

export interface BoardLane {
  name: string;
  /** 122 holes, index = score. */
  holes: HolePoint[];
}

export interface BoardLayout {
  /** The art's file name inside the skin. */
  image: string;
  /** The art's size in pixels (the hole map is in fractions, so this is only its shape). */
  size: [number, number];
  /** Left lane (the opponent's) then right lane (yours), as the board stands upright. */
  lanes: [BoardLane, BoardLane];
  /** Hole radius, as a fraction of the image width. */
  holeRadius: number;
  /** Peg radius, as a fraction of the image width. */
  pegRadius: number;
  /** Every hole must sit inside this box: [left, top, right, bottom] fractions. */
  safeBox?: [number, number, number, number];
  /** Both lanes end in the same game hole (121), as on a real board. */
  sharedGameHole?: boolean;
  /** Standing pegs drawn from art (side view, tip at the bottom) instead of round pegs. */
  pegSprite?: PegSprite;
}

export interface PegSprite {
  /** The art's file names inside the skin: your peg and the opponent's. */
  me: string;
  opponent: string;
  /** The sprite's size in pixels (only its shape matters). */
  size: [number, number];
  /** How tall a peg stands, as a fraction of the board image's width. */
  height: number;
}

export interface BoardSkin {
  id: string;
  name: string;
  version: number;
  author?: string;
  /** Standing upright (landscape tables). Portrait tables lay it on its side. */
  upright: BoardLayout;
}

/** A skin ready to draw: the map plus the URLs of its art. */
export interface ResolvedBoardSkin extends BoardSkin {
  imageUrl: string;
  /** The standing peg art, when the skin has it. */
  pegUrls?: { me: string; opponent: string };
}

export const HOLES_PER_LANE = 122;
export const DEFAULT_BOARD_SKIN = "serpent-reef";

/** The art of a board with Serpent Reef's standing pegs. */
const withPegs = (file: string, url: string) => ({
  [file]: url,
  "peg-blue.webp": pegBlueUrl,
  "peg-red.webp": pegRedUrl,
});

/** Every board the app ships, keyed by its JSON id: the map and the bundled art it names.
 *  Classic Serpent isn't sold; it stays for AnimationLab. */
const REGISTRY: Record<string, { json: unknown; images: Record<string, string> }> = {
  "serpent-reef": {
    json: serpentReef,
    images: withPegs("board-serpent.webp", serpentReefBoardUrl),
  },
  "treasure-map": {
    json: treasureMap,
    images: withPegs("board-treasure-map.webp", treasureMapBoardUrl),
  },
  "krakens-reef": {
    json: krakensReef,
    images: withPegs("board-krakens-reef.webp", krakensReefBoardUrl),
  },
  "ghost-ship": { json: ghostShip, images: withPegs("board-ghost-ship.webp", ghostShipBoardUrl) },
  "royal-navy": { json: royalNavy, images: withPegs("board-royal-navy.webp", royalNavyBoardUrl) },
  "classic-serpent": { json: classicSerpent, images: { "board.webp": classicSerpentBoardUrl } },
};

const PREFIX = "board.";
/** The skin id for a key: "board.treasure-map" and "treasure-map" are the same board. */
const skinId = (key: string) => (key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every(isNum);

function layoutErrors(raw: unknown, where: string): string[] {
  if (!raw || typeof raw !== "object") return [`${where} is missing`];
  const l = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof l.image !== "string" || !l.image) errors.push(`${where}.image must name a file`);
  if (!isPair(l.size) || l.size[0] <= 0 || l.size[1] <= 0)
    errors.push(`${where}.size must be [width, height]`);
  for (const key of ["holeRadius", "pegRadius"] as const) {
    const v = l[key];
    if (!isNum(v) || v <= 0 || v > 0.25) errors.push(`${where}.${key} must be between 0 and 0.25`);
  }
  const box = l.safeBox ?? [0, 0, 1, 1];
  if (!Array.isArray(box) || box.length !== 4 || !box.every(isNum))
    errors.push(`${where}.safeBox must be [left, top, right, bottom]`);
  const [left, top, right, bottom] = (
    Array.isArray(box) && box.length === 4 ? box : [0, 0, 1, 1]
  ) as [number, number, number, number];

  if (!Array.isArray(l.lanes) || l.lanes.length !== 2) {
    errors.push(`${where}.lanes must hold two lanes`);
    return errors;
  }
  l.lanes.forEach((lane: unknown, i) => {
    const holes = (lane as BoardLane | null)?.holes;
    if (!Array.isArray(holes) || holes.length !== HOLES_PER_LANE) {
      errors.push(`${where}.lanes[${i}] needs exactly ${HOLES_PER_LANE} holes`);
      return;
    }
    holes.forEach((h: unknown, n) => {
      if (!isPair(h)) errors.push(`${where}.lanes[${i}] hole ${n} is not [x, y]`);
      else if (h[0] < left || h[0] > right || h[1] < top || h[1] > bottom)
        errors.push(`${where}.lanes[${i}] hole ${n} is outside the board`);
    });
  });
  const sprite = l.pegSprite as Record<string, unknown> | undefined;
  if (
    sprite !== undefined &&
    (typeof sprite?.me !== "string" ||
      typeof sprite.opponent !== "string" ||
      !isPair(sprite.size) ||
      !isNum(sprite.height) ||
      sprite.height <= 0 ||
      sprite.height > 0.5)
  )
    errors.push(`${where}.pegSprite needs me, opponent, size and a height up to 0.5`);
  if (errors.length) return errors;

  // A shared game hole must really be one point in both lanes.
  const lanes = l.lanes as BoardLane[];
  const shared = l.sharedGameHole === true;
  const game = HOLES_PER_LANE - 1;
  const [g0, g1] = [lanes[0]!.holes[game]!, lanes[1]!.holes[game]!];
  if (shared && (g0[0] !== g1[0] || g0[1] !== g1[1]))
    errors.push(`${where}: the shared game hole must be the same point in both lanes`);

  // No two holes so close that their pegs would sit on top of each other.
  const [w, h] = l.size as [number, number];
  const minGap = 1.5 * (l.holeRadius as number) * w;
  // (The second lane's copy of a shared game hole is skipped: it is the same hole.)
  const all = lanes.flatMap((lane, i) =>
    lane.holes
      .map(([x, y], n) => ({ x: x * w, y: y * h, name: `lanes[${i}] hole ${n}`, n }))
      .filter(({ n }) => !(shared && i === 1 && n === game)),
  );
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      if (Math.hypot(all[a]!.x - all[b]!.x, all[a]!.y - all[b]!.y) < minGap) {
        errors.push(`${where}: ${all[a]!.name} and ${all[b]!.name} are too close`);
        if (errors.length > 5) return errors;
      }
    }
  }
  return errors;
}

/** What's wrong with a skin's JSON, or an empty list when it's fine to draw. */
export function boardSkinErrors(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return ["skin is not an object"];
  const s = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof s.id !== "string" || !s.id) errors.push("id is missing");
  if (typeof s.name !== "string" || !s.name) errors.push("name is missing");
  if (!isNum(s.version)) errors.push("version is missing");
  return [...errors, ...layoutErrors(s.upright, "upright")];
}

/** Checks a skin and pairs it with its art, or explains why it can't be used. */
export function resolveBoardSkin(
  raw: unknown,
  images: Record<string, string>,
): { skin: ResolvedBoardSkin; errors: [] } | { skin: null; errors: string[] } {
  const errors = boardSkinErrors(raw);
  if (errors.length) return { skin: null, errors };
  const skin = raw as BoardSkin;
  const imageUrl = images[skin.upright.image];
  if (!imageUrl) return { skin: null, errors: [`image ${skin.upright.image} is not bundled`] };
  const sprite = skin.upright.pegSprite;
  if (!sprite) return { skin: { ...skin, imageUrl }, errors: [] };
  const me = images[sprite.me];
  const opponent = images[sprite.opponent];
  if (!me || !opponent) return { skin: null, errors: ["the peg art is not bundled"] };
  return { skin: { ...skin, imageUrl, pegUrls: { me, opponent } }, errors: [] };
}

const cache = new Map<string, ResolvedBoardSkin>();
/** Keys already reported, so a board drawn on every render (and every peg hop) logs once. */
const reported = new Set<string>();

/**
 * The board to draw for a key. An unknown or broken skin (say, an item from a newer server that
 * this build lacks) gives the default board with `fallback: true`, and logs why once per key.
 */
export function resolveBoard(key: string): { skin: ResolvedBoardSkin; fallback: boolean } {
  const id = skinId(key);
  const hit = cache.get(id);
  if (hit) return { skin: hit, fallback: false };
  const entry = REGISTRY[id];
  const result = entry
    ? resolveBoardSkin(entry.json, entry.images)
    : { skin: null, errors: ["no such skin"] };
  if (result.skin) {
    cache.set(id, result.skin);
    return { skin: result.skin, fallback: false };
  }
  if (id === DEFAULT_BOARD_SKIN)
    throw new Error(`The default board skin is broken: ${result.errors.join("; ")}`);
  if (!reported.has(key)) {
    reported.add(key);
    console.error(
      `Board skin "${key}" can't be used, so the default board is shown:`,
      result.errors,
    );
  }
  return { skin: resolveBoard(DEFAULT_BOARD_SKIN).skin, fallback: true };
}

/** The board skin to draw. An unknown or broken skin gives the default board. */
export function getBoardSkin(key: string = DEFAULT_BOARD_SKIN): ResolvedBoardSkin {
  return resolveBoard(key).skin;
}

/** Every board the app ships, keyed by item id (AnimationLab; Classic Serpent isn't sold). */
export function listBoards(): { key: string; skin: ResolvedBoardSkin }[] {
  return Object.keys(REGISTRY).map((id) => ({ key: PREFIX + id, skin: resolveBoard(id).skin }));
}

/** A board's height over its width, to 3 places (Serpent Reef: 2.917). The table layout is tuned
 *  to Serpent Reef's shape, so every board for sale must have its ratio. */
export function boardRatio(skin: BoardSkin): number {
  const [w, h] = skin.upright.size;
  return Math.round((h / w) * 1000) / 1000;
}

/** Where a peg at `score` stands on a lane, in the art's pixels. Scores clamp to 0..121. */
export function holePoint(layout: BoardLayout, lane: 0 | 1, score: number): [number, number] {
  const n = Math.max(0, Math.min(HOLES_PER_LANE - 1, Math.round(score)));
  const [x, y] = layout.lanes[lane].holes[n]!;
  return [x * layout.size[0], y * layout.size[1]];
}
