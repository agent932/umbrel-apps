import { afterEach, describe, expect, it } from "vitest";
import { signUp, testApp } from "../test/testApp.js";
import {
  LONG,
  type StateMsg,
  connect,
  matchedPair,
  move,
  nextMove,
  playOut,
} from "../test/wsClient.js";
import type { ServerMessage } from "./protocol.js";
import type { Timing } from "./rooms.js";

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

/** A fresh app with the given clocks, and two matched players on it. */
async function pair(timing: Timing = LONG, variant: "classic" | "pirate" = "classic") {
  t = await testApp(undefined, timing);
  return matchedPair(t, { variant });
}

describe("online play", () => {
  it("refuses connections without a session", async () => {
    t = await testApp();
    const c = await connect(t.app);
    expect(await c.next((m) => m.t === "error")).toMatchObject({ message: "Sign in first" });
    expect(await c.closed).toBe(4401);
  });

  it("pairs two players through Quick Match and shows each only their own hand", async () => {
    const { gameId, a, b, sa, sb } = await pair();
    expect(new Set([sa.seat, sb.seat])).toEqual(new Set([0, 1]));
    expect(sa.names).toEqual(sb.names);
    expect([...sa.names].sort()).toEqual(["Anne", "Bonny"]);
    // Bonny joined second, so her first state shows both players connected.
    expect(sb.online).toEqual([true, true]);
    // The game opens with both players cutting for deal.
    expect(sa.step.view.phase).toBe("cutForDeal");
    for (const c of [a, b]) await move(c, gameId, nextMove(c.latestState()!.step.view, false)!);
    let la = a.latestState()!;
    for (let i = 0; la.step.view.phase === "cutForDeal" && i < 20; i++) {
      // A tied cut: both cut again.
      for (const c of [a, b]) {
        const m = nextMove(c.latestState()!.step.view, false);
        if (m) await move(c, gameId, m);
      }
      la = a.latestState()!;
    }
    const lb = b.latestState()!;
    for (const s of [la, lb]) {
      expect(s.step.view.phase).toBe("discard");
      expect(s.step.view.hand).toHaveLength(6);
      expect(s.step.view).not.toHaveProperty("hands");
    }
    // Neither player's cards appear anywhere in what the other was sent.
    expect(JSON.stringify(b.messages)).not.toContain(JSON.stringify(la.step.view.hand));
  });

  it("only pairs players who asked for the same rules", async () => {
    t = await testApp(undefined, LONG);
    const a = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
    const b = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
    a.send({ t: "queue", menu: { variant: "classic" } });
    await a.next((m) => m.t === "queued");
    b.send({ t: "queue", menu: { variant: "pirate", powerCost: 0 } });
    await b.next((m) => m.t === "queued");
    expect(a.messages.some((m) => m.t === "matched")).toBe(false);
  });

  it("plays a whole online game and records it for both players", async () => {
    const { gameId, a, b, anne, bonny } = await pair();
    const end = await playOut(gameId, [a, b]);
    expect(end.step.view.winner).not.toBeNull();

    const stats = async (cookie: string) =>
      (await t.app.inject({ url: "/api/stats", headers: { cookie } }))
        .json()
        .buckets.find((x: { key: string }) => x.key === "online").stats;
    const sa = await stats(anne.cookie);
    const sb = await stats(bonny.cookie);
    expect(sa.matchesPlayed).toBe(1);
    expect(sb.matchesPlayed).toBe(1);
    expect(sa.wins + sb.wins).toBe(1);
    expect(sa.roundsPlayed).toBe(sb.roundsPlayed);
    // Each sees the other's averages as "opponent".
    expect(sa.hand.avg).toBeCloseTo(sb.hand.avgOpp);
  }, 60_000);

  it("plays a pirate game online", async () => {
    const { gameId, a, b } = await pair(LONG, "pirate");
    const end = await playOut(gameId, [a, b]);
    expect(end.step.view.phase).toBe("gameOver");
  }, 60_000);

  it("rejects illegal moves and moves from people not in the game", async () => {
    const { gameId, a } = await pair();
    a.send({ t: "act", gameId, action: { type: "play", card: { rank: 5, suit: "H" } } });
    expect(await a.next((m) => m.t === "error")).toMatchObject({ message: "Not time to play" });

    const c = await connect(t.app, (await signUp(t.app, "Calico")).cookie);
    c.send({ t: "watch", gameId });
    expect(await c.next((m) => m.t === "error")).toMatchObject({
      message: "You're not in that game",
    });
    c.send({ t: "act", gameId, action: { type: "cut" } });
    expect(await c.next((m) => m.t === "error")).toMatchObject({
      message: "You're not in that game",
    });
    c.send({ t: "nonsense" });
    expect(await c.next((m) => m.t === "error")).toMatchObject({ message: "Unrecognised message" });
  });

  it("starts the next round only when both players are ready", async () => {
    const { gameId, a, b } = await pair();
    // Play until the first round summary.
    for (let i = 0; i < 400; i++) {
      const phases = [a, b].map((c) => c.latestState()!.step.view.phase);
      if (phases.every((p) => p === "roundEnd" || p === "gameOver")) break;
      let moved = false;
      for (const c of [a, b]) {
        const s = c.latestState()!;
        const action = s.step.view.phase === "roundEnd" ? null : nextMove(s.step.view, false);
        if (!action) continue;
        await move(c, gameId, action);
        moved = true;
      }
      if (!moved) await new Promise((r) => setTimeout(r, 5));
    }
    if (a.latestState()!.step.view.phase !== "roundEnd") return; // game ended in round 1 (very rare)
    const mark = b.messages.length;
    await move(a, gameId, { type: "nextRound" });
    expect(await b.after(mark, (m) => m.t === "waiting")).toMatchObject({ for: "nextRound" });
    await move(b, gameId, { type: "nextRound" });
    const s = await a.next<StateMsg>(
      (m) => m.t === "state" && m.step.view.phase === "discard" && m.step.view.round === 2,
    );
    expect(s.step.view.round).toBe(2);
  }, 30_000);

  it("moves for a player who runs out of time", async () => {
    const { a, b } = await pair({ turnMs: 150, nextRoundMs: 150, disconnectMs: 60_000 });
    // Nobody discards; the server throws for them.
    expect(await a.next((m) => m.t === "timeout", 3000)).toMatchObject({ t: "timeout" });
    const s = await b.next<StateMsg>(
      (m) => m.t === "state" && m.step.events.some((e) => e.type === "discarded"),
      3000,
    );
    expect(s.step.events.length).toBeGreaterThan(0);
  });

  it("gives the game to the opponent when a player stays disconnected", async () => {
    const { gameId, a, b, sa } = await pair({
      turnMs: 60_000,
      nextRoundMs: 60_000,
      disconnectMs: 150,
    });
    const mark = b.messages.length;
    a.ws.terminate();
    const p = await b.after<Extract<ServerMessage, { t: "presence" }>>(
      mark,
      (m) => m.t === "presence",
    );
    // The opponent is told when the missing player forfeits unless they're back.
    expect(p.returnBy[sa.seat]).toBeGreaterThan(Date.now());
    expect(p.returnBy[1 - sa.seat]).toBeNull();
    const f = await b.next<Extract<ServerMessage, { t: "forfeit" }>>(
      (m) => m.t === "forfeit",
      3000,
    );
    expect(f.seat).toBe(sa.seat);
    const end = await b.next<StateMsg>((m) => m.t === "state" && m.step.view.phase === "gameOver");
    expect(end.step.view.winner).toBe(1 - sa.seat);
    const active = await t.app.inject({
      url: "/api/online/active",
      headers: { cookie: (await signUp(t.app, "Zed")).cookie },
    });
    expect(active.json().games).toEqual([]);
    void gameId;
  });

  it("lets a player reconnect in time and pick up where they left off", async () => {
    const { gameId, a, sa, anne } = await pair({
      turnMs: 60_000,
      nextRoundMs: 60_000,
      disconnectMs: 500,
    });
    a.ws.terminate();
    const again = await connect(t.app, anne.cookie);
    const hello = await again.next<Extract<ServerMessage, { t: "hello" }>>((m) => m.t === "hello");
    expect(hello.activeGames).toEqual([gameId]);
    again.send({ t: "watch", gameId });
    const s = await again.next<StateMsg>((m) => m.t === "state");
    expect(s.step.view.hand).toEqual(sa.step.view.hand);
    await new Promise((r) => setTimeout(r, 700));
    expect(again.messages.some((m) => m.t === "forfeit")).toBe(false);
  });

  it("forfeits on request", async () => {
    const { gameId, a, b, sa } = await pair();
    a.send({ t: "forfeit", gameId });
    const f = await b.next<Extract<ServerMessage, { t: "forfeit" }>>((m) => m.t === "forfeit");
    expect(f.seat).toBe(sa.seat);
  });

  it("resumes a game after a server restart", async () => {
    const { gameId, sa, anne } = await pair();
    const app2 = await t.restart();
    const c = await connect(app2, anne.cookie);
    c.send({ t: "watch", gameId });
    const s = await c.next<StateMsg>((m) => m.t === "state");
    expect(s.step.view.hand).toEqual(sa.step.view.hand);
    expect([...s.names].sort()).toEqual(["Anne", "Bonny"]);
    await app2.close();
  });

  describe("invites", () => {
    it("lets a friend join with the code", async () => {
      t = await testApp(undefined, LONG);
      const host = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      host.send({ t: "createInvite", menu: { variant: "pirate", powerCost: 2 } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      expect(code).toMatch(/^[A-Z2-9]{6}$/);

      host.send({ t: "joinInvite", code });
      expect(await host.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/own invite/),
      });

      guest.send({ t: "joinInvite", code: code.toLowerCase() });
      const { gameId } = await guest.next<Extract<ServerMessage, { t: "matched" }>>(
        (m) => m.t === "matched",
      );
      expect(await host.next((m) => m.t === "matched")).toMatchObject({ gameId });
      guest.send({ t: "watch", gameId });
      const s = await guest.next<StateMsg>((m) => m.t === "state");
      expect(s.step.view.rules.pirate?.powerCost).toBe(2);

      // Codes work once.
      const third = await connect(t.app, (await signUp(t.app, "Calico")).cookie);
      third.send({ t: "joinInvite", code });
      expect(await third.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/expired/),
      });
    });

    it("cancels an invite when the host disconnects", async () => {
      t = await testApp(undefined, LONG);
      const host = await connect(t.app, (await signUp(t.app, "Anne")).cookie);
      host.send({ t: "createInvite", menu: { variant: "classic" } });
      const { code } = await host.next<Extract<ServerMessage, { t: "invite" }>>(
        (m) => m.t === "invite",
      );
      host.ws.terminate();
      await new Promise((r) => setTimeout(r, 50));
      const guest = await connect(t.app, (await signUp(t.app, "Bonny")).cookie);
      guest.send({ t: "joinInvite", code });
      expect(await guest.next((m) => m.t === "error")).toMatchObject({
        message: expect.stringMatching(/expired/),
      });
    });
  });
});
