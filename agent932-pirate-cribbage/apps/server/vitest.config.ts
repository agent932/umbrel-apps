import { defineProject } from "vitest/config";

export default defineProject({
  // Simulation-heavy tests run slower on CI runners than locally.
  test: { name: "server", testTimeout: 60_000 },
});
