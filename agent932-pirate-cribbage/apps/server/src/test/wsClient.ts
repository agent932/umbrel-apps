import type { WebSocket } from "ws";
import { type PlayerView, chooseDiscard, choosePlay } from "@pirate/engine";
import type { ClientAction } from "../games/actions.js";
import type { ServerMessage } from "../online/protocol.js";
import type { Timing } from "../online/rooms.js";
import { signUp, type testApp } from "./testApp.js";

type TestApp = Awaited<ReturnType<typeof testApp>>;

export type StateMsg = Extract<ServerMessage, { t: "state" }>;

export const LONG: Timing = { turnMs: 60_000, nextRoundMs: 60_000, disconnectMs: 60_000 };

/**
 * A WebSocket test client. Every message is kept in arrival order; `next` hands out each
 * matching message once (oldest first), and `after` waits for one that arrives after a point.
 */
/** `auth` is a cookie header, or the raw headers to send (e.g. the app's token subprotocol). */
export async function connect(app: TestApp["app"], auth?: string | Record<string, string>) {
  await app.ready();
  const messages: ServerMessage[] = [];
  const taken = new Set<number>();
  const listeners = new Set<() => void>();
  let resolveClosed: (code: number) => void = () => {};
  const closed = new Promise<number>((r) => (resolveClosed = r));
  // Listeners go on in onInit, before the socket opens, so the server's first message isn't missed.
  const ws: WebSocket = await app.injectWS(
    "/api/ws",
    { headers: typeof auth === "string" ? { cookie: auth } : (auth ?? {}) },
    {
      onInit: (socket: WebSocket) => {
        socket.on("message", (raw) => {
          messages.push(JSON.parse(String(raw)) as ServerMessage);
          for (const l of [...listeners]) l();
        });
        socket.on("close", (code) => resolveClosed(code));
      },
    },
  );

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
export type TestClient = Awaited<ReturnType<typeof connect>>;

/** Two signed-up players, connected, paired through Quick Match, and watching their game. */
export async function matchedPair(
  t: TestApp,
  menu: object = { variant: "classic" },
  names = ["Anne", "Bonny"],
  /** Crew portraits to pick before connecting. */
  avatars?: [number | null, number | null],
) {
  const anne = await signUp(t.app, names[0]);
  const bonny = await signUp(t.app, names[1]);
  if (avatars) {
    for (const [i, who] of [anne, bonny].entries()) {
      await t.app.inject({
        method: "POST",
        url: "/api/auth/avatar",
        headers: { cookie: who.cookie },
        payload: { avatar: avatars[i] },
      });
    }
  }
  const a = await connect(t.app, anne.cookie);
  const b = await connect(t.app, bonny.cookie);
  await a.next((m) => m.t === "hello");
  await b.next((m) => m.t === "hello");
  a.send({ t: "queue", menu });
  await a.next((m) => m.t === "queued");
  b.send({ t: "queue", menu });
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
export function nextMove(view: PlayerView, readyForNext: boolean): ClientAction | null {
  const mine = view.toAct.includes(view.seat);
  switch (view.phase) {
    case "cutForDeal": {
      // Cut any face-down card the other player hasn't taken.
      const cfd = view.cutForDeal;
      if (!mine || !cfd?.deckSize) return null;
      const index = Array.from({ length: cfd.deckSize }, (_, i) => i).find(
        (i) => !cfd.taken.includes(i),
      )!;
      return { type: "pickCut", index };
    }
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
export async function move(c: TestClient, gameId: string, action: ClientAction) {
  const mark = c.messages.length;
  c.send({ t: "act", gameId, action });
  const reply = await c.after(mark, (m) => m.t === "state" || m.t === "waiting" || m.t === "error");
  if (reply.t === "error") throw new Error(reply.message);
  return reply;
}

/** The latest round-summary readiness this client has heard about. */
export function readyForNext(c: TestClient, s: StateMsg) {
  const last = c.messages.filter((m) => m.t === "waiting" || m.t === "state").at(-1);
  const ready = last?.t === "waiting" ? last.ready : s.nextRoundReady;
  return ready.includes(s.seat);
}

/** Both clients play themselves until the game ends. */
export async function playOut(gameId: string, clients: TestClient[]) {
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
