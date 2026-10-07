import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // sound.ts fetches its samples, and the CSP only lets the page fetch from its own site, so a
    // small sound inlined as a data: URI would be blocked. Keep every sound a real file.
    assetsInlineLimit: (file) => (file.endsWith(".mp3") ? false : undefined),
  },
  server: {
    port: 5173,
    proxy: {
      // ws: the online game socket lives under /api/ws.
      "/api": { target: "http://localhost:3000", ws: true },
    },
  },
});
