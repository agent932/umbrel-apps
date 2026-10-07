// What every board and card is drawn with. Only Card and TableBoard read these contexts; nothing
// else gets a new prop. The defaults are the default pair and today's faces, so anything drawn
// without a provider (tests, the lab) looks as it always has.
import { createContext, useContext, useEffect, useMemo } from "react";
import { type Cosmetics, DEFAULT_COSMETICS } from "@pirate/engine";
import { useAuth } from "../auth.js";
import { getBoardSkin } from "./boardSkins.js";
import { getDeckSkin } from "./deckSkins.js";
import { type FaceStyle, PIRATE_PORTRAITS } from "./faceStyles.js";
import { preloadCosmetics } from "./preloadSkins.js";

/** Board and back: the viewer's own, or the host's in an online game. */
export const CosmeticsContext = createContext<Cosmetics>(DEFAULT_COSMETICS);
export const CosmeticsProvider = CosmeticsContext.Provider;
export const useCosmetics = () => useContext(CosmeticsContext);
export const useBoardSkin = () => getBoardSkin(useCosmetics().board);
export const useDeckSkin = () => getDeckSkin(useCosmetics().deck);

/** Card faces: always the viewer's own, never the host's (the host shares a board and backs only). */
export const FaceStyleContext = createContext<FaceStyle>(PIRATE_PORTRAITS);
export const useFaceStyle = () => useContext(FaceStyleContext);

/**
 * The signed-in player's own choice: the defaults for guests, and when /me fails (offline, the app
 * treats them as a guest). Goes inside AuthProvider.
 */
export function ViewerCosmetics({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const board = user?.equippedBoard ?? DEFAULT_COSMETICS.board;
  const deck = user?.equippedDeck ?? DEFAULT_COSMETICS.deck;
  const value = useMemo(() => ({ board, deck }), [board, deck]);
  // Your own art is ready before any table.
  useEffect(() => void preloadCosmetics(value), [value]);
  // And the defaults once, so the service worker always holds them for offline guest games.
  useEffect(() => void preloadCosmetics(DEFAULT_COSMETICS), []);
  return (
    <FaceStyleContext.Provider value={PIRATE_PORTRAITS}>
      <CosmeticsProvider value={value}>{children}</CosmeticsProvider>
    </FaceStyleContext.Provider>
  );
}
