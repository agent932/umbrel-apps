import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { testApp } from "./test/testApp.js";

let t: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => {
  const dist = mkdtempSync(join(tmpdir(), "pc-web-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html>");
  mkdirSync(join(dist, "cinematics"));
  writeFileSync(join(dist, "cinematics", "cannon.webm"), "clip");
  t = await testApp(undefined, undefined, undefined, dist);
});
afterEach(async () => t.close());

it("lets browsers keep the painted scene clips for a week", async () => {
  const clip = await t.app.inject({ url: "/cinematics/cannon.webm" });
  expect(clip.statusCode).toBe(200);
  expect(clip.headers["cache-control"]).toBe("public, max-age=604800");
  // The app page itself is always checked for a newer version.
  const page = await t.app.inject({ url: "/" });
  expect(page.headers["cache-control"]).not.toContain("604800");
});
