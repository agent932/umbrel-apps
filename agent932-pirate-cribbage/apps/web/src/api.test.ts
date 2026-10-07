import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api.js";

/** The server answers every request with this status and body. */
function answer(status: number, body: object) {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(body), { status }));
}
const failure = (path: string) => api(path, { body: {} }).catch((e: unknown) => e);

describe("api errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("carry the server's message, status and short code", async () => {
    answer(409, {
      error: "Treasure Map costs 1,500 doubloons and you have 900",
      code: "short",
    });
    const err = await failure("/api/shop/buy");
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      message: "Treasure Map costs 1,500 doubloons and you have 900",
      status: 409,
      code: "short",
    });
  });

  it("have no code when the server gives none", async () => {
    answer(400, { error: "Pick an item" });
    expect(await failure("/api/shop/use")).toMatchObject({ status: 400, code: undefined });
    answer(500, {});
    expect(await failure("/api/shop/use")).toMatchObject({
      message: "Request failed (500)",
      code: undefined,
    });
  });
});
