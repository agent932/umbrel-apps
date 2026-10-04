import { Capacitor } from "@capacitor/core";

/**
 * The iPhone app runs these same pages from its own bundle (capacitor://localhost), so it talks
 * to the real server by full address and signs in with a token instead of a cookie.
 */
export const isNativeApp = Capacitor.isNativePlatform();

/** Where the app finds the server. Empty on the web: same site as the page. */
export const API_ORIGIN = isNativeApp
  ? (import.meta.env.VITE_APP_SERVER ?? "https://deckhand.games")
  : "";

/** The public address to put in links people share (invites). */
export const SITE_ORIGIN = isNativeApp ? API_ORIGIN : location.origin;

const TOKEN_KEY = "deckhand.session";

/** The app's session token (never used on the web, which has an httpOnly cookie). */
export function appToken(): string | null {
  if (!isNativeApp) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAppToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the player just signs in again next launch.
  }
}
