import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The iPhone app. The game's pages ship inside the app (apps/web/dist) and talk to
 * https://deckhand.games (see apps/web/src/native.ts). Build with `npm run app:ios`.
 */
const config: CapacitorConfig = {
  appId: "games.deckhand.app",
  appName: "Deckhand Games",
  webDir: "apps/web/dist",
  backgroundColor: "#04121c",
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#04121c", showSpinner: false },
  },
};

export default config;
