import { fileURLToPath } from "node:url";

export const PORT = Number(process.env.E2E_PORT ?? 4173);
// localhost, not 127.0.0.1: browsers treat it as a secure origin, as the live site is.
export const BASE_URL = `http://localhost:${PORT}`;

/** The browser tests' players live only in the test server's in-memory database. */
export const PASSWORD = "e2e-pass-1";

/**
 * Players signed up before the tests start. Each browser project gets its own crew, named with
 * the project's tag (AnneC in Chromium, AnneW in WebKit), so projects running side by side never
 * meet. CaptainC signs up first, so it's the admin.
 */
export const PLAYERS = ["Captain", "Anne", "Bonny", "Calico", "Davy", "Jack"] as const;
export type Player = (typeof PLAYERS)[number];
export const TAGS = ["C", "W"] as const;

export const username = (player: Player, tag: string) => `${player}${tag}`;

/** Where each player's signed-in browser state (the session cookie) is kept between steps. */
export const authFile = (name: string) =>
  fileURLToPath(new URL(`.auth/${name}.json`, import.meta.url));
