import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT } from "./e2e/players.js";

/**
 * End-to-end tests: real browsers against the production build and the real server (on an
 * in-memory database). Chromium plays on a desktop; WebKit plays on an iPhone-sized screen, the
 * same engine as the iPhone app.
 */
export default defineConfig({
  testDir: "e2e",
  // Whole games are played in real time.
  timeout: 240_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, metadata: { tag: "C" } },
    { name: "iphone", use: { ...devices["iPhone 13"] }, metadata: { tag: "W" } },
  ],
  webServer: {
    command: "npm run build -w @pirate/web && tsx e2e/server.ts",
    url: `${BASE_URL}/api/health`,
    // Always a fresh server, so every run starts from an empty database.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { E2E_PORT: String(PORT) },
  },
});
