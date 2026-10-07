import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { request } from "@playwright/test";
import { authFile, BASE_URL, PASSWORD, PLAYERS, TAGS, username } from "./players.js";

/** Sign up every test player once and keep their session for the tests to reuse. */
export default async function globalSetup() {
  await mkdir(dirname(authFile("x")), { recursive: true });
  let n = 0;
  for (const tag of TAGS) {
    for (const player of PLAYERS) {
      const name = username(player, tag);
      // Each from its own address, so the sign-up limit (10 a minute per address) never trips.
      const api = await request.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { "cf-connecting-ip": `10.9.0.${++n}` },
      });
      const res = await api.post("/api/auth/signup", {
        data: { username: name, email: `${name.toLowerCase()}@example.test`, password: PASSWORD },
      });
      if (!res.ok())
        throw new Error(`Sign-up of ${name} failed: ${res.status()} ${await res.text()}`);
      await api.storageState({ path: authFile(name) });
      await api.dispose();
    }
  }
}
