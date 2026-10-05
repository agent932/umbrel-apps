// Board skins: a board is an image plus a JSON hole map, so a new board needs no code. The map
// gives each player's lane 122 holes (index = score: 0 is the start pocket, 121 the game hole) as
// fractions of the image, and the hole and peg sizes as fractions of the image's width.
// A skin that fails validation falls back to the default board.
import type { HolePoint } from "./boardTrack.js";
import classicSerpent from "./boards/classic-serpent.json";
import classicSerpentBoardUrl from "../assets/table/board.webp";

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
}

export interface BoardSkin {
  id: string;
  name: string;
  version: number;
  author?: string;
  /** Standing upright (landscape tables). Portrait tables lay it on its side. */
  upright: BoardLayout;
}

/** A skin ready to draw: the map plus the URL of its art. */
export interface ResolvedBoardSkin extends BoardSkin {
  imageUrl: string;
}

export const HOLES_PER_LANE = 122;
export const DEFAULT_BOARD_SKIN = "classic-serpent";

/** Every board the app ships: the JSON map and the bundled art it names. */
const REGISTRY: Record<string, { json: unknown; images: Record<string, string> }> = {
  "classic-serpent": { json: classicSerpent, images: { "board.webp": classicSerpentBoardUrl } },
};

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
  if (errors.length) return errors;

  // No two holes so close that their pegs would sit on top of each other.
  const [w, h] = l.size as [number, number];
  const minGap = 1.5 * (l.holeRadius as number) * w;
  const all = (l.lanes as BoardLane[]).flatMap((lane, i) =>
    lane.holes.map(([x, y], n) => ({ x: x * w, y: y * h, name: `lanes[${i}] hole ${n}` })),
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
  return { skin: { ...skin, imageUrl }, errors: [] };
}

const cache = new Map<string, ResolvedBoardSkin>();

/** The board skin to draw. An unknown or broken skin logs why and gives the default board. */
export function getBoardSkin(id: string = DEFAULT_BOARD_SKIN): ResolvedBoardSkin {
  const hit = cache.get(id);
  if (hit) return hit;
  const entry = REGISTRY[id];
  const result = entry
    ? resolveBoardSkin(entry.json, entry.images)
    : { skin: null, errors: ["no such skin"] };
  if (result.skin) {
    cache.set(id, result.skin);
    return result.skin;
  }
  if (id === DEFAULT_BOARD_SKIN)
    throw new Error(`The default board skin is broken: ${result.errors.join("; ")}`);
  console.error(`Board skin "${id}" can't be used, so the default board is shown:`, result.errors);
  return getBoardSkin(DEFAULT_BOARD_SKIN);
}

/** Where a peg at `score` stands on a lane, in the art's pixels. Scores clamp to 0..121. */
export function holePoint(layout: BoardLayout, lane: 0 | 1, score: number): [number, number] {
  const n = Math.max(0, Math.min(HOLES_PER_LANE - 1, Math.round(score)));
  const [x, y] = layout.lanes[lane].holes[n]!;
  return [x * layout.size[0], y * layout.size[1]];
}
