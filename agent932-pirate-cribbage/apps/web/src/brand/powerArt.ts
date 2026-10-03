import type { PowerId } from "@pirate/engine";
import spyglassUrl from "../assets/table/p-spyglass.webp";
import crowsNestUrl from "../assets/table/p-crowsNest.webp";
import parleyUrl from "../assets/table/p-parley.webp";
import pickpocketUrl from "../assets/table/p-pickpocket.webp";
import reburyUrl from "../assets/table/p-rebury.webp";
import belayUrl from "../assets/table/p-belay.webp";

/** The painted button for each pirate power. */
export const POWER_ART: Record<PowerId, string> = {
  spyglass: spyglassUrl,
  crowsNest: crowsNestUrl,
  parley: parleyUrl,
  pickpocket: pickpocketUrl,
  rebury: reburyUrl,
  belay: belayUrl,
};

/** Peg colours: blue for you, red for your opponent (the dots by each name match). */
export const PEG_COLORS = { me: "#3d8bfd", opponent: "#e5383b" };

/** The cutlass, for challenges. */
export const CUTLASS_URL = belayUrl;
/** The spyglass, for looking for an opponent. */
export const SPYGLASS_URL = spyglassUrl;
