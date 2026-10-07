// Card faces: how the court cards (and later the pips) are drawn. A face style is the viewer's own
// choice and never comes with a card back: a back changes only the back of every card. The pirate
// portraits are the only style for now; a later one (standard pips, traditional courts) is a new
// FaceStyle here.
import jackUrl from "../assets/table/court-jack.webp";
import queenUrl from "../assets/table/court-queen.webp";
import kingUrl from "../assets/table/court-king.webp";

export type FaceStyleId = "pirate-portraits";

export interface FaceStyle {
  id: FaceStyleId | string;
  /** The court art, by rank: Jack, Queen, King. */
  courts: { 11: string; 12: string; 13: string };
}

export const PIRATE_PORTRAITS: FaceStyle = {
  id: "pirate-portraits",
  courts: { 11: jackUrl, 12: queenUrl, 13: kingUrl },
};
