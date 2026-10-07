import { afterEach, describe, expect, it } from "vitest";
import { testApp } from "../test/testApp.js";
import { LONG, type StateMsg, matchedPair, move, nextMove } from "../test/wsClient.js";
import type { ServerMessage } from "./protocol.js";
import type { Timing } from "./rooms.js";

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

const isState = (m: ServerMessage): m is StateMsg => m.t === "state";

/**
 * A pirate game (free powers) played up to the discard. `carryOn`: both players' apps have the
 * Carry on button; older iPhone builds don't say so.
 */
async function atTheDiscard(timing: Timing = LONG, carryOn = true) {
  t = await testApp(undefined, timing);
  const pair = await matchedPair(t, { variant: "pirate", powerCost: 0 });
  const { gameId, a, b } = pair;
  if (carryOn) {
    for (const c of [a, b]) {
      const mark = c.messages.length;
      c.send({ t: "watch", gameId, carryOn: true });
      await c.after(mark, isState);
    }
  }
  for (let i = 0; i < 50; i++) {
    const views = [a, b].map((c) => c.latestState()!.step.view);
    if (views.every((v) => v.phase === "discard")) break;
    let moved = false;
    for (const c of [a, b]) {
      const v = c.latestState()!.step.view;
      const m = v.phase === "cutForDeal" ? nextMove(v, false) : null;
      if (m) {
        await move(c, gameId, m);
        moved = true;
      }
    }
    if (!moved) await new Promise((r) => setTimeout(r, 10));
  }
  return pair;
}

const discard = (c: Awaited<ReturnType<typeof atTheDiscard>>["a"]) =>
  nextMove(c.latestState()!.step.view, false)!;

describe("pirate scenes online", () => {
  it("wait for both players to carry on before play goes on", async () => {
    const { gameId, a, b, sa } = await atTheDiscard();
    expect(await move(a, gameId, { type: "spyglass" })).toMatchObject({ sceneWaits: [0, 1] });

    // Nobody plays on while the scene is up.
    let mark = b.messages.length;
    b.send({ t: "act", gameId, action: discard(b) });
    expect(await b.after(mark, (m) => m.t === "error")).toMatchObject({
      message: "Waiting for both players to carry on",
    });

    mark = b.messages.length;
    a.send({ t: "carryOn", gameId });
    expect(await b.after(mark, (m) => m.t === "waiting")).toEqual({
      t: "waiting",
      gameId,
      for: "scene",
      ready: [sa.seat],
    });

    mark = a.messages.length;
    b.send({ t: "carryOn", gameId });
    expect(await a.after(mark, isState)).toMatchObject({ sceneWaits: [] });
    expect(await move(b, gameId, discard(b))).toMatchObject({ t: "state" });
  });

  it("don't wait for an app without the Carry on button", async () => {
    const { gameId, a, b } = await atTheDiscard(LONG, false);
    expect(await move(a, gameId, { type: "spyglass" })).toMatchObject({ sceneWaits: [] });
    expect(await move(b, gameId, discard(b))).toMatchObject({ t: "state" });
  });

  it("carry on by themselves when the move clock runs out", async () => {
    const { gameId, a, b } = await atTheDiscard({
      turnMs: 1000,
      nextRoundMs: 60_000,
      disconnectMs: 60_000,
    });
    await move(a, gameId, { type: "spyglass" });
    const mark = b.messages.length;
    expect(await b.after(mark, (m) => isState(m) && m.sceneWaits.length === 0, 4000)).toBeTruthy();
  });

  it("ignore a Carry on after the game has ended (a skunk's scene)", async () => {
    const { gameId, a } = await atTheDiscard();
    a.send({ t: "forfeit", gameId });
    await a.next((m) => isState(m) && m.step.view.phase === "gameOver");
    const mark = a.messages.length;
    a.send({ t: "carryOn", gameId });
    a.send({ t: "nonsense" });
    // The only answer is to the nonsense: nothing about the Carry on.
    expect(await a.after(mark, (m) => m.t === "error")).toMatchObject({
      message: "Unrecognised message",
    });
  });

  it("stop waiting for a player who leaves", async () => {
    const { gameId, a, b } = await atTheDiscard();
    await move(a, gameId, { type: "spyglass" });
    a.send({ t: "carryOn", gameId });
    await b.next((m) => m.t === "waiting");
    const mark = a.messages.length;
    b.ws.terminate();
    expect(await a.after(mark, isState)).toMatchObject({ sceneWaits: [] });
  });
});
