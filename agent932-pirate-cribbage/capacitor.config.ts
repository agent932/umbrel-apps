import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "games.deckhand.app",
  appName: "Deckhand Games",
  webDir: "apps/web/dist",
  backgroundColor: "#04121c",
  server: {
    url: "https://deckhand.games",
    cleartext: false,
  },
  ios: {
    contentInset: "never",
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#04121c", showSpinner: false },
  },
};

export default config;
