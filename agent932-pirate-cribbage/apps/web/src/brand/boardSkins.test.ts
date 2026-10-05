import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BOARD_SKIN,
  HOLES_PER_LANE,
  boardSkinErrors,
  getBoardSkin,
  holePoint,
} from "./boardSkins.js";
import { classicSerpentLanes, serpentReefLanes } from "./boardTrack.js";
import classicSerpent from "./boards/classic-serpent.json";
import serpentReef from "./boards/serpent-reef.json";

const copy = () => structuredClone(classicSerpent) as typeof classicSerpent;

describe("board skins", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Serpent Reef is the default board, and both boards pass validation", () => {
    expect(DEFAULT_BOARD_SKIN).toBe("serpent-reef");
    expect(getBoardSkin().name).toBe("Serpent Reef");
    expect(getBoardSkin().pegUrls).toBeDefined();
    expect(boardSkinErrors(serpentReef)).toEqual([]);
    expect(boardSkinErrors(classicSerpent)).toEqual([]);
    expect(getBoardSkin("classic-serpent").name).toBe("Classic Serpent");
  });

  it("each skin's hole map is the one the track generator lays out", () => {
    // If this fails: npx tsx scripts/board-skins.ts && npx prettier --write apps/web/src/brand/boards
    const [left, right] = classicSerpentLanes();
    expect(classicSerpent.upright.lanes[0]!.holes).toEqual(left);
    expect(classicSerpent.upright.lanes[1]!.holes).toEqual(right);
    const [outer, inner] = serpentReefLanes();
    expect(serpentReef.upright.lanes[0]!.holes).toEqual(outer);
    expect(serpentReef.upright.lanes[1]!.holes).toEqual(inner);
  });

  it("allows one game hole shared by both lanes, but only when the skin says so", () => {
    const reef = () => structuredClone(serpentReef) as typeof serpentReef;
    const [a, b] = reef().upright.lanes.map((lane) => lane.holes[121]);
    expect(a).toEqual(b);
    const unshared = reef() as Record<string, unknown> & typeof serpentReef;
    delete (unshared.upright as { sharedGameHole?: boolean }).sharedGameHole;
    expect(boardSkinErrors(unshared).join()).toMatch(
      /hole 121 and lanes\[1\] hole 121 are too close/,
    );
    const apart = reef();
    apart.upright.lanes[1]!.holes[121] = [0.5, 0.2];
    expect(boardSkinErrors(apart)).toContain(
      "upright: the shared game hole must be the same point in both lanes",
    );
  });

  it("rejects a lane that's short of holes", () => {
    const skin = copy();
    skin.upright.lanes[1]!.holes.pop();
    expect(boardSkinErrors(skin)).toContain(
      `upright.lanes[1] needs exactly ${HOLES_PER_LANE} holes`,
    );
  });

  it("rejects a hole off the board", () => {
    const skin = copy();
    skin.upright.lanes[0]!.holes[30] = [0.5, 1.4];
    expect(boardSkinErrors(skin)).toContain("upright.lanes[0] hole 30 is outside the board");
  });

  it("rejects holes on top of each other, and nonsense", () => {
    const skin = copy();
    skin.upright.lanes[0]!.holes[2] = skin.upright.lanes[0]!.holes[1]!;
    expect(boardSkinErrors(skin).join()).toMatch(/hole 1 and lanes\[0\] hole 2 are too close/);
    expect(boardSkinErrors(null)).not.toEqual([]);
    expect(boardSkinErrors({ ...copy(), upright: undefined })).toContain("upright is missing");
  });

  it("falls back to the default board for an unknown skin", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getBoardSkin("no-such-board").id).toBe(DEFAULT_BOARD_SKIN);
    expect(log).toHaveBeenCalled();
  });

  it("Classic Serpent: one continuous track per lane with a U-turn at the top", () => {
    const { upright } = getBoardSkin("classic-serpent");
    for (const lane of [0, 1] as const) {
      const at = (n: number) => holePoint(upright, lane, n);
      // Up one column in fives: a wider gap between 5 and 6 than between 4 and 5.
      expect(at(1)[0]).toBe(at(60 - 4)[0]);
      expect(at(1)[1]).toBeGreaterThan(at(5)[1]);
      expect(at(5)[1] - at(6)[1]).toBeGreaterThan(at(4)[1] - at(5)[1]);
      // 60 and 61 sit level across the top of the turn, then it comes back down the other column.
      expect(at(60)[1]).toBeCloseTo(at(61)[1], 0);
      expect(at(65)[0]).toBe(at(120)[0]);
      expect(at(120)[0]).not.toBe(at(1)[0]);
      expect(at(120)[1]).toBeCloseTo(at(1)[1], 0);
      // Neighbouring holes are always close: no jump between columns.
      for (let n = 0; n < 120; n++) {
        const [a, b] = [at(n), at(n + 1)];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(40);
      }
      // Start pocket and game hole at the foot of the lane; scores off the ends clamp.
      expect(at(0)[1]).toBeGreaterThan(at(1)[1]);
      expect(at(121)[1]).toBe(at(0)[1]);
      expect(at(-3)).toEqual(at(0));
      expect(at(130)).toEqual(at(121));
    }
    // You climb the right channel's outer column, the opponent the left one's.
    expect(holePoint(upright, 0, 1)[0]).toBeLessThan(holePoint(upright, 0, 120)[0]);
    expect(holePoint(upright, 1, 1)[0]).toBeGreaterThan(holePoint(upright, 1, 120)[0]);
  });

  describe("Serpent Reef track", () => {
    const { upright } = getBoardSkin("serpent-reef");
    const [W, H] = upright.size;
    // The light bands, measured by hand on board-serpent.webp (art pixels): [left, right] edges
    // of the straight bands, the top arch and bottom U-turn as rings, and the plain start panel.
    const LEFT_BAND = [72, 196];
    const MIDDLE = [329, 451];
    const RIGHT_BAND = [584, 706];
    const inRing = ([x, y]: number[], c: number[], r0: number, r1: number) =>
      Math.hypot(x! - c[0]!, y! - c[1]!) >= r0 && Math.hypot(x! - c[0]!, y! - c[1]!) <= r1;
    const onBand = (p: [number, number]) => {
      const [x, y] = p;
      const pad = upright.holeRadius * W;
      const within = ([a, b]: number[]) => x - pad >= a! && x + pad <= b!;
      if (within(MIDDLE) && y > 331) return true; // under the middle column's cap
      if (y < 377) return inRing(p, [390, 377], 192 + pad, 318 - pad); // top arch
      if (y > 1823 && x > 390) return inRing(p, [517.5, 1823], 66 + pad, 182 - pad); // bottom U
      return within(LEFT_BAND) || within(MIDDLE) || within(RIGHT_BAND);
    };
    const at = (lane: 0 | 1, n: number) => holePoint(upright, lane, n);

    it.each([1, 5, 6, 30, 45, 60, 61, 75, 85, 90, 105, 119, 120])(
      "hole %i sits on a light band in both lanes",
      (n) => {
        expect(onBand(at(0, n))).toBe(true);
        expect(onBand(at(1, n))).toBe(true);
      },
    );

    it("starts in the plain bottom panel and finishes in the middle column's rounded top", () => {
      for (const lane of [0, 1] as const) {
        const [x, y] = at(lane, 0);
        expect(x).toBeGreaterThan(LEFT_BAND[0]!);
        expect(x).toBeLessThan(LEFT_BAND[1]!);
        expect(y).toBeGreaterThan(2098); // below the wave carving
        expect(y).toBeLessThan(2203);
      }
      const [gx, gy] = at(0, 121);
      expect(gx).toBeCloseTo(390, 0);
      expect(gy).toBeGreaterThan(300);
      expect(gy).toBeLessThan(at(0, 120)[1]);
      expect(at(1, 121)).toEqual(at(0, 121));
    });

    it("runs up the left, over the top, down the right, round the bottom and up the middle", () => {
      for (const lane of [0, 1] as const) {
        const x = (n: number) => at(lane, n)[0];
        const y = (n: number) => at(lane, n)[1];
        // Up the left band (1-34ish), across the top, down the right, U-turn, up the middle.
        for (let n = 1; n < 30; n++) expect(y(n + 1)).toBeLessThan(y(n));
        expect(x(30)).toBeLessThan(LEFT_BAND[1]!);
        expect(y(45)).toBeLessThan(377);
        expect(x(60)).toBeGreaterThan(RIGHT_BAND[0]!);
        for (let n = 55; n < 80; n++) expect(y(n + 1)).toBeGreaterThan(y(n));
        expect(y(85)).toBeGreaterThan(1823);
        expect(x(95)).toBeGreaterThan(MIDDLE[0]!);
        expect(x(95)).toBeLessThan(MIDDLE[1]!);
        for (let n = 92; n < 120; n++) expect(y(n + 1)).toBeLessThan(y(n));
        // Neighbouring holes are always close: no jump across a carved channel.
        for (let n = 1; n < 120; n++) {
          const [a, b] = [at(lane, n), at(lane, n + 1)];
          expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(80);
        }
      }
      expect(W).toBe(793);
      expect(H).toBe(2313);
    });

    it("groups the holes in fives, with a wider gap between groups", () => {
      const step = (n: number) => {
        const [a, b] = [at(0, n), at(0, n + 1)];
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
      };
      // On the straight left band: inside a group, then across a group gap.
      // (Holes are stored to 4 decimals, so spacings agree to within half a pixel.)
      expect(step(1)).toBeCloseTo(step(2), 0);
      expect(step(5)).toBeCloseTo(step(1) * 1.5, 0);
      expect(step(100)).toBeCloseTo(step(1) * 1.5, 0);
      // The two lanes' holes pair up side by side on a straight run.
      expect(at(0, 10)[1]).toBeCloseTo(at(1, 10)[1], 0);
      expect(at(1, 10)[0] - at(0, 10)[0]).toBeCloseTo(60, 0);
    });
  });
});
