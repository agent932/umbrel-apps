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
