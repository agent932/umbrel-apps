import type { GameEvent, Seat } from "@pirate/engine";

/**
 * What Peggy squawks after a step, if anything. Picks the most exciting moment in the batch.
 * `me` is the viewer's seat, so she can cheer for you and grumble at the other side.
 */
export function quipFor(events: GameEvent[], me: Seat): string | null {
  let best: { score: number; line: string } | null = null;
  const consider = (score: number, line: string) => {
    if (!best || score > best.score) best = { score, line };
  };

  for (const e of events) {
    switch (e.type) {
      case "played": {
        const s = e.score;
        if (s.pairs === 12) consider(9, "Four of a kind! SQUAWK!");
        else if (s.pairs === 6) consider(7, "Three of a kind! Awk!");
        if (s.run >= 4) consider(6, `A run of ${s.run}! Awk!`);
        if (s.thirtyOne) consider(5, "Thirty-one! Squawk!");
        if (s.fifteen) consider(4, "Fifteen-two! Awk!");
        if (s.pairs === 2) consider(3, "A pair! Awk!");
        if (s.run === 3) consider(3, "A run of three!");
        break;
      }
      case "go":
        consider(1, e.seat === me ? "Go, matey!" : "Go! Awk!");
        break;
      case "heels":
        consider(5, "His heels! Two for the dealer!");
        break;
      case "hand":
      case "crib": {
        const t = e.score.total;
        if (t === 29) consider(10, "TWENTY-NINE!!! SQUAWK!!!");
        else if (t >= 20) consider(8, `${t} points! Shiver me timbers!`);
        else if (t >= 14) consider(6, `${t}! Pieces of eight!`);
        else if (t === 0 && e.type === "hand") consider(2, "Nineteen… Awk. Nothing at all.");
        break;
      }
      case "treasure":
        consider(8, "Pieces of eight! Buried treasure!");
        break;
      case "kraken":
        consider(8, "KRAAAKEN! Awk!");
        break;
      case "blackSpot":
        consider(8, "The Black Spot! The crib's been stolen!");
        break;
      case "power":
        consider(2, e.power === "belay" ? "Belay that! Awk!" : "Arr, sneaky!");
        break;
      case "gameOver":
        if (e.winner === me)
          consider(11, e.skunk ? "Skunked 'em! Victory! Awk!" : "Victory! Awk! Awk!");
        else consider(11, e.skunk ? "Skunked… to Davy Jones' locker." : "Defeat… Awk.");
        break;
    }
  }
  return (best as { line: string } | null)?.line ?? null;
}
