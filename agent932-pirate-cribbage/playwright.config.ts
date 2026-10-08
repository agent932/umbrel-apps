import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT } from "./e2e/players.js";

/**
 * End-to-end tests: real browsers against the production build and the real server (on an
 * in-memory database). Chromium plays on a desktop; WebKit plays on an iPhone-sized screen, the
 * same engine as the iPhone app.
 *
 * Whole games take minutes each, so they're tagged @game and play in Chromium only. The quick set
 * is every other test, in both browsers: npm run e2e:quick. CI runs all of them, the games on a
 * machine of their own.
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
    {
      // The shop as a release ships it: closed to players. One server serves the whole run and
      // the shop tests open it, so this runs first. It plays in the run's browser: a machine that
      // runs only the iphone project has only WebKit (E2E_DEVICE=iphone). Its players are the C
      // crew, whose captain is the admin.
      name: "shop-closed",
      testMatch: /shop-closed\.setup\.ts$/,
      use: { ...devices[process.env.E2E_DEVICE === "iphone" ? "iPhone 13" : "Desktop Chrome"] },
      metadata: { tag: "C" },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      metadata: { tag: "C" },
      dependencies: ["shop-closed"],
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"] },
      metadata: { tag: "W" },
      dependencies: ["shop-closed"],
    },
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
