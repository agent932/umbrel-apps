import { afterEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { type PlayerView, chooseDiscard, choosePlay } from "@pirate/engine";
import { signUp, testApp } from "../test/testApp.js";
import type { ClientAction } from "../games/actions.js";
import type { ServerMessage } from "./protocol.js";
import type { Timing } from "./rooms.js";

type StateMsg = Extract<ServerMessage, { t: "state" }>;

let t: Awaited<ReturnType<typeof testApp>>;
afterEach(async () => t?.close());

const LONG: Timing = { turnMs: 60_000, nextRoundMs: 60_000, disconnectMs: 60_000 };

/**
 * A WebSocket test client. Every message is kept in arrival order; `next` hands out each
 * matching message once (oldest first), and `after` waits for one that arrives after a point.
 */
async function connect(app: typeof t.app, cookie?: string) {
  await app.ready();
  const messages: ServerMessage[] = [];
  const taken = new Set<number>();
  const listeners = new Set<() => void>();
  let resolveClosed: (code: number) => void = () => {};
  const closed = new Promise<number>((r) => (resolveClosed = r));
  // Listeners go on in onInit, before the socket opens, so the server's first message isn't missed.
  const ws: WebSocket = await app.injectWS("/api/ws", cookie ? { headers: { cookie } } : {}, {
    onInit: (socket: WebSocket) => {
      socket.on("message", (raw) => {
        messages.push(JSON.parse(String(raw)) as ServerMessage);
        for (const l of [...listeners]) l();
      });
      socket.on("close", (code) => resolveClosed(code));
    },
  });

  function waitFor<T extends ServerMessage>(find: () => T | undefined, ms: number): Promise<T> {
    const found = find();
    if (found) return Promise.resolve(found);
    return new Promise<T>((resolve, reject) => {
      const check = () => {
        const m = find();
        if (!m) return;
        listeners.delete(check);
        clearTimeout(timer);
        resolve(m);
      };
      const timer = setTimeout(() => {
        listeners.delete(check);
        reject(
          new Error(
            `timed out; last messages: ${JSON.stringify(messages.slice(-2)).slice(0, 400)}`,
          ),
        );
      }, ms);
      listeners.add(check);
    });
  }

  return {
    ws,
    messages,
    closed,
    send: (m: object) => ws.send(JSON.stringify(m)),
    next<T extends ServerMessage>(pred: (m: ServerMessage) => boolean, ms = 5000): Promise<T> {
      return waitFor(() => {
        const i = messages.findIndex((m, idx) => !taken.has(idx) && pred(m));
        if (i < 0) return undefined;
        taken.add(i);
        return messages[i] as T;
      }, ms);
    },
    after<T extends ServerMessage>(
      index: number,
      pred: (m: ServerMessage) => boolean,
      ms = 5000,
    ): Promise<T> {
      return waitFor(() => messages.slice(index).find(pred) as T | undefined, ms);
    },
    latestState(): StateMsg | undefined {
      return messages.filter((m): m is StateMsg => m.t === "state").at(-1);
    },
  };
}
type TestClient = Awaited<ReturnType<typeof connect>>;

/** Two signed-up players, connected, paired through Quick Match, and watching their game. */
async function matchedPair(timing: Timing = LONG, variant: "classic" | "pirate" = "classic") {
  t = await testApp(undefined, timing);
  const anne = await signUp(t.app, "Anne");
  const bonny = await signUp(t.app, "Bonny");
  const a = await connect(t.app, anne.cookie);
  const b = await connect(t.app, bonny.cookie);
  await a.next((m) => m.t === "hello");
  await b.next((m) => m.t === "hello");
  a.send({ t: "queue", menu: { variant } });
  await a.next((m) => m.t === "queued");
  b.send({ t: "queue", menu: { variant } });
  const { gameId } = await a.next<Extract<ServerMessage, { t: "matched" }>>(
    (m) => m.t === "matched",
  );
  await b.next((m) => m.t === "matched");
  a.send({ t: "watch", gameId });
  b.send({ t: "watch", gameId });
  const sa = await a.next<StateMsg>((m) => m.t === "state");
  const sb = await b.next<StateMsg>((m) => m.t === "state");
  return { gameId, a, b, sa, sb, anne, bonny };
}

/** What a sensible player sends next, from what the server shows them. */
function nextMove(view: PlayerView, readyForNext: boolean): ClientAction | null {
  const mine = view.toAct.includes(view.seat);
  switch (view.phase) {
    case "discard":
      return view.hand.length === 6
        ? { type: "discard", cards: chooseDiscard(view.hand, view.dealer === view.seat) }
        : null;
    case "cut":
      return mine ? { type: "cut" } : null;
    case "preplay":
      return view.needsReady ? { type: "ready" } : null;
    case "pegging":
      return mine ? { type: "play", card: choosePlay(view) } : null;
    case "roundEnd":
      return readyForNext ? null : { type: "nextRound" };
    default:
      return null;
  }
}

/** Send a move and wait for the server's answer (new state, a "waiting" note, or an error). */
async function move(c: TestClient, gameId: string, action: ClientAction) {
  const mark = c.messages.length;
  c.send({ t: "act", gameId, action });
  const reply = await c.after(mark, (m) => m.t === "state" || m.t === "waiting" || m.t === "error");
  if (reply.t === "error") throw new Error(reply.message);
  return reply;
}

/** The latest round-summary readiness this client has heard about. */
function readyForNext(c: TestClient, s: StateMsg) {
  const last = c.messages.filter((m) => m.t === "waiting" || m.t === "state").at(-1);
  const ready = last?.t === "waiting" ? last.ready : s.nextRoundReady;
  return ready.includes(s.seat);
}

/** Both clients play themselves until the game ends. */
async function playOut(gameId: string, clients: TestClient[]) {
  for (let i = 0; i < 4000; i++) {
    let moved = false;
    for (const c of clients) {
      const s = c.latestState();
      if (!s) continue;
      if (s.step.view.phase === "gameOver") return s;
      const action = nextMove(s.step.view, readyForNext(c, s));
      if (!action) continue;
      await move(c, gameId, action);
      moved = true;
    }
    if (!moved) await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Game did not finish");
}

describe("online play", () => {
  it("refuses connections without a session", async () => {
    t = await testApp();
    const c = await connect(t.app);
    expect(await c.next((m) => m.t === "error")).toMatchObject({ message: "Sign in first" });
    expect(await c.closed).toBe(4401);
  });

  it("pairs two players through Quick Match and shows each only their own hand", async () => {
    const { sa, sb } = await matchedPair();
    expect(new Set([sa.seat, sb.seat])).toEqual(new Set([0, 1]));
    expect(sa.names).toEqual(sb.names);
    expect([...sa.names].sort()).toEqual(["Anne", "Bonny"]);
    for (const s of [sa, sb]) {
      expect(s.step.view.phase).toBe("discard");
      expect(s.step.view.hand).toHaveLength(6);
      expect(s.step.view).not.toHaveProperty("hands");
    }
    // Bonny joined second, so her first state shows both players connected.
    expect(sb.online).toEqual([true, true]);
    // Neither player's cards appear anywhere in what the other was sent.
    expect(JSON.stringify(sb)).not.toContain(JSON.stringify(sa.step.view.hand));
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
    const { gameId, a, b, anne, bonny } = await matchedPair();
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
    const { gameId, a, b } = await matchedPair(LONG, "pirate");
    const end = await playOut(gameId, [a, b]);
    expect(end.step.view.phase).toBe("gameOver");
  }, 60_000);

  it("rejects illegal moves and moves from people not in the game", async () => {
    const { gameId, a, sa } = await matchedPair();
    a.send({ t: "act", gameId, action: { type: "play", card: sa.step.view.hand[0] } });
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
    const { gameId, a, b } = await matchedPair();
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
    const { a, b } = await matchedPair({ turnMs: 150, nextRoundMs: 150, disconnectMs: 60_000 });
    // Nobody discards; the server throws for them.
    expect(await a.next((m) => m.t === "timeout", 3000)).toMatchObject({ t: "timeout" });
    const s = await b.next<StateMsg>(
      (m) => m.t === "state" && m.step.events.some((e) => e.type === "discarded"),
      3000,
    );
    expect(s.step.events.length).toBeGreaterThan(0);
  });

  it("gives the game to the opponent when a player stays disconnected", async () => {
    const { gameId, a, b, sa } = await matchedPair({
      turnMs: 60_000,
      nextRoundMs: 60_000,
      disconnectMs: 150,
    });
    a.ws.terminate();
    expect(await b.next((m) => m.t === "presence")).toMatchObject({ t: "presence" });
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
    const { gameId, a, sa, anne } = await matchedPair({
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
    const { gameId, a, b, sa } = await matchedPair();
    a.send({ t: "forfeit", gameId });
    const f = await b.next<Extract<ServerMessage, { t: "forfeit" }>>((m) => m.t === "forfeit");
    expect(f.seat).toBe(sa.seat);
  });

  it("resumes a game after a server restart", async () => {
    const { gameId, sa, anne } = await matchedPair();
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
