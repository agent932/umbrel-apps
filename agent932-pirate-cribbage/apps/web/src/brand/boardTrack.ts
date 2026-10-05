// Lays out one player's lane as a classic continuous cribbage track: up one column, a U-turn at
// the top, back down the other column. Used to build a board skin's hole map (see boardSkins.ts);
// `scripts/board-default-skin.ts` writes the default skin's JSON with it.

/** A hole, as fractions of the board image: x right, y down. */
export type HolePoint = [number, number];

export interface TrackSpec {
  /** The board art's size in pixels. */
  size: [number, number];
  /** The middle of the lane's carved channel, in art pixels. */
  centreX: number;
  /** Which column the lane climbs: -1 the left one, 1 the right one. It comes back down the other. */
  side: -1 | 1;
  /** Half the distance between the two columns; also the U-turn's radius. */
  colOff: number;
  /** Centre of the U-turn, in art pixels from the top. */
  turnY: number;
  /** Distance between neighbouring holes along the track. */
  pitch: number;
  /** Extra space after every fifth hole. */
  groupGap: number;
  /** Where the start pocket (score 0) and the game hole (121) sit, in art pixels from the top. */
  footY: number;
}

/** How far along the track hole n (1..120) sits, in art pixels from hole 1. */
const along = (n: number, spec: TrackSpec) =>
  (n - 1) * spec.pitch + Math.floor((n - 1) / 5) * spec.groupGap;

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * The lane's 122 holes, index = score: 0 is the start pocket under the climbing column, 1-60 go
 * up, 61-120 come back down (the U-turn's holes are spaced along the curve, not the chord) and
 * 121 is the game hole at the foot, between the columns.
 */
export function continuousTrack(spec: TrackSpec): HolePoint[] {
  const { size, centreX, side, colOff: r, turnY } = spec;
  const arc = Math.PI * r;
  // Equal straight runs either side of the turn, so 60 and 61 sit level across the top.
  const straight = (along(120, spec) - arc) / 2;
  const startY = turnY + straight;
  const upX = centreX + side * r;
  const downX = centreX - side * r;

  const point = (d: number): [number, number] => {
    if (d <= straight) return [upX, startY - d];
    if (d <= straight + arc) {
      const theta = (d - straight) / r;
      return [centreX + side * r * Math.cos(theta), turnY - r * Math.sin(theta)];
    }
    return [downX, turnY + (d - straight - arc)];
  };

  const px: [number, number][] = [[upX, spec.footY]];
  for (let n = 1; n <= 120; n++) px.push(point(along(n, spec)));
  px.push([centreX, spec.footY]);
  return px.map(([x, y]) => [round4(x / size[0]), round4(y / size[1])]);
}

/** Measured on board.webp (700 x 1400): the two carved channels, with room for the U-turn. */
const CLASSIC_SERPENT: Omit<TrackSpec, "centreX" | "side"> = {
  size: [700, 1400],
  colOff: 36,
  turnY: 245,
  pitch: 15,
  groupGap: 8,
  footY: 1203,
};

/** The default board's two lanes: the opponent climbs the left channel's outer column, you the right's. */
export function classicSerpentLanes(): [HolePoint[], HolePoint[]] {
  return [
    continuousTrack({ ...CLASSIC_SERPENT, centreX: 238, side: -1 }),
    continuousTrack({ ...CLASSIC_SERPENT, centreX: 460, side: 1 }),
  ];
}

/** One piece of a lane's centre path: a straight run to a point, or an arc around a centre. */
export type PathSegment =
  | { line: [number, number] }
  /** Turns around `centre` by `sweep` radians (positive turns clockwise on screen). */
  | { centre: [number, number]; sweep: number };

export interface PathTrackSpec {
  /** The board art's size in pixels. */
  size: [number, number];
  /** Where the band's centre path starts (hole 1, between the two lanes), in art pixels. */
  from: [number, number];
  /** The band's centre path from hole 1 to hole 120. */
  path: PathSegment[];
  /** How far each lane sits either side of the centre path. */
  laneOffset: number;
  /** The extra space after every fifth hole, as a share of the hole spacing. */
  groupGap: number;
  /** Each lane's start pocket (score 0), in art pixels: left of the travel direction, then right. */
  starts: [[number, number], [number, number]];
  /** The one game hole (121) both lanes share. */
  gameHole: [number, number];
}

interface Piece {
  length: number;
  /** The point and the direction of travel at distance t into the piece. */
  at: (t: number) => { p: [number, number]; dir: [number, number] };
}

function pieces(spec: PathTrackSpec): Piece[] {
  let cur = spec.from;
  return spec.path.map((seg) => {
    const start = cur;
    if ("line" in seg) {
      const [dx, dy] = [seg.line[0] - start[0], seg.line[1] - start[1]];
      const length = Math.hypot(dx, dy);
      const dir: [number, number] = [dx / length, dy / length];
      cur = seg.line;
      return { length, at: (t) => ({ p: [start[0] + dir[0] * t, start[1] + dir[1] * t], dir }) };
    }
    const [cx, cy] = seg.centre;
    const r = Math.hypot(start[0] - cx, start[1] - cy);
    const a0 = Math.atan2(start[1] - cy, start[0] - cx);
    const turn = Math.sign(seg.sweep);
    const angle = (t: number) => a0 + (turn * t) / r;
    const end = angle(Math.abs(seg.sweep) * r);
    cur = [cx + r * Math.cos(end), cy + r * Math.sin(end)];
    return {
      length: Math.abs(seg.sweep) * r,
      at: (t) => {
        const a = angle(t);
        return {
          p: [cx + r * Math.cos(a), cy + r * Math.sin(a)],
          dir: [-Math.sin(a) * turn, Math.cos(a) * turn],
        };
      },
    };
  });
}

/** How long a lane's centre path is, in art pixels. */
export const pathLength = (spec: PathTrackSpec) =>
  pieces(spec).reduce((sum, piece) => sum + piece.length, 0);

/**
 * Two lanes side by side along one band, for a board whose track winds (any number of turns):
 * holes 1-120 are spaced evenly by distance along the band's centre path, in groups of five with
 * a small extra gap, from the path's start to its end. Each lane sits `laneOffset` to one side
 * (lane 0 on the left of the direction of travel), so its holes pair up with the other lane's;
 * on a turn the inner lane's holes are a little closer together. 0 is each lane's start pocket
 * and 121 the shared game hole.
 */
export function pathTrackLanes(spec: PathTrackSpec): [HolePoint[], HolePoint[]] {
  const parts = pieces(spec);
  const total = parts.reduce((sum, piece) => sum + piece.length, 0);
  const pitch = total / (119 + 23 * spec.groupGap);
  const point = (d: number) => {
    for (const piece of parts) {
      if (d <= piece.length + 1e-9) return piece.at(Math.min(d, piece.length));
      d -= piece.length;
    }
    const last = parts[parts.length - 1]!;
    return last.at(last.length);
  };
  const frac = ([x, y]: [number, number]): HolePoint => [
    round4(x / spec.size[0]),
    round4(y / spec.size[1]),
  ];
  return ([1, -1] as const).map((side, lane) => {
    const holes: HolePoint[] = [frac(spec.starts[lane]!)];
    for (let n = 1; n <= 120; n++) {
      const d = (n - 1 + Math.floor((n - 1) / 5) * spec.groupGap) * pitch;
      const { p, dir } = point(d);
      // Left of the direction of travel, on screen (y down).
      const left: [number, number] = [dir[1], -dir[0]];
      holes.push(
        frac([p[0] + side * spec.laneOffset * left[0], p[1] + side * spec.laneOffset * left[1]]),
      );
    }
    holes.push(frac(spec.gameHole));
    return holes;
  }) as [HolePoint[], HolePoint[]];
}

/**
 * Measured on board-serpent.webp (793 x 2313): the light bands are 123-125 px wide, centred at
 * x 134 (left), 390 (middle column) and 645 (right). The top arch is centred on (390, 377) with
 * its centre line 256 px out (a thin painted line runs along it); the bottom U-turn joins the
 * right band to the middle column around (517.5, 1823), 127.5 px out. The track starts at the
 * foot of the left band, climbs it, rounds the arch, comes down the right band, turns at the
 * bottom and climbs the middle column to the game hole in its rounded cap.
 */
export const SERPENT_REEF: PathTrackSpec = {
  size: [793, 2313],
  from: [134, 1960],
  path: [
    { line: [134, 377] },
    { centre: [390, 377], sweep: Math.PI },
    { line: [645, 1823] },
    { centre: [517.5, 1823], sweep: Math.PI },
    { line: [390, 376] },
  ],
  laneOffset: 30,
  groupGap: 0.5,
  starts: [
    [104, 2150],
    [164, 2150],
  ],
  gameHole: [390, 331],
};

/** The Serpent Reef board's lanes: the opponent's on the outside of the turns, yours inside. */
export const serpentReefLanes = () => pathTrackLanes(SERPENT_REEF);
