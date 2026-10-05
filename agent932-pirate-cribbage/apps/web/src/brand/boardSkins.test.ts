import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BOARD_SKIN,
  HOLES_PER_LANE,
  boardSkinErrors,
  getBoardSkin,
  holePoint,
} from "./boardSkins.js";
import { classicSerpentLanes } from "./boardTrack.js";
import classicSerpent from "./boards/classic-serpent.json";

const copy = () => structuredClone(classicSerpent) as typeof classicSerpent;

describe("board skins", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the default skin passes validation", () => {
    expect(boardSkinErrors(classicSerpent)).toEqual([]);
    expect(getBoardSkin().id).toBe(DEFAULT_BOARD_SKIN);
  });

  it("the default skin's hole map is the one the track generator lays out", () => {
    // If this fails: npx tsx scripts/board-default-skin.ts && npx prettier --write apps/web/src/brand/boards
    const [left, right] = classicSerpentLanes();
    expect(classicSerpent.upright.lanes[0]!.holes).toEqual(left);
    expect(classicSerpent.upright.lanes[1]!.holes).toEqual(right);
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

  it("lays each lane out as one continuous track with a U-turn at the top", () => {
    const { upright } = getBoardSkin();
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
});
