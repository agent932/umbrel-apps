import { defineProject } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineProject({
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // The end-to-end test boots the server's test app; under jsdom it can't locate files itself.
    env: { SERVER_MIGRATIONS: path.resolve(import.meta.dirname, "../server/drizzle") },
  },
});
