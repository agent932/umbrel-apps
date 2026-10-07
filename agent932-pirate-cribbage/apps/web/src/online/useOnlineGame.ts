import { useCallback, useEffect, useRef, useState } from "react";
import type { Reward, Seat } from "@pirate/engine";
import { initialPresentation, present } from "../game/present.js";
import type { GameController, Presentation, UiAction } from "../game/types.js";
import type { Emote, StateMessage } from "./protocol.js";
import { socket } from "./socket.js";

interface OnlineState {
  p: Presentation | null;
  names: [string, string];
  avatars: [number | null, number | null];
  ranked: boolean;
  emote: { seat: Seat; emote: Emote; key: number } | null;
  rematch: "none" | "waiting" | "offered";
  rematchGameId: string | null;
  deadline: number | null;
  online: [boolean, boolean];
  returnBy: [number | null, number | null];
  nextRoundReady: Seat[];
  sceneWaits: Seat[];
  forfeitedBy: Seat | null;
  /** Your doubloons, sent with the state that ends the game. */
  reward: Reward | null;
  error: string | null;
}

/** Names by seat, with "You" in your own seat so the game log reads naturally. */
function namesFor(m: StateMessage): [string, string] {
  return m.seat === 0 ? ["You", m.names[1]] : [m.names[0], "You"];
}

export function useOnlineGame(
  gameId: string,
): GameController | { loading: true; error: string | null } {
  const [s, setS] = useState<OnlineState>({
    p: null,
    names: ["You", "Opponent"],
    avatars: [null, null],
    ranked: false,
    emote: null,
    rematch: "none",
    rematchGameId: null,
    deadline: null,
    online: [true, true],
    returnBy: [null, null],
    nextRoundReady: [],
    sceneWaits: [],
    forfeitedBy: null,
    reward: null,
    error: null,
  });
  // Whether this server holds play at pirate scenes (its states say who it's waiting on). An
  // older one would answer a Carry on with an error, so it isn't sent one.
  const serverWaits = useRef(false);

  useEffect(() => {
    const release = socket.use();
    const stopListening = socket.listen((m) => {
      // A rematch you asked for has started: it arrives under the new game's id.
      if (m.t === "matched") {
        setS((prev) => (prev.rematch === "none" ? prev : { ...prev, rematchGameId: m.gameId }));
        return;
      }
      if ("gameId" in m && m.gameId !== gameId) return;
      switch (m.t) {
        case "state":
          serverWaits.current = Array.isArray(m.sceneWaits);
          setS((prev) => {
            const names = namesFor(m);
            const base = prev.p ?? initialPresentation(m.step.view);
            return {
              ...prev,
              p: present(base, m.step.events, m.step.view, names),
              names,
              avatars: m.avatars ?? [null, null],
              ranked: m.ranked ?? false,
              deadline: m.deadline,
              online: m.online,
              returnBy: m.returnBy ?? [null, null],
              nextRoundReady: m.nextRoundReady,
              sceneWaits: m.sceneWaits ?? [],
              reward: m.reward ?? prev.reward,
              error: null,
            };
          });
          break;
        case "waiting":
          setS((prev) =>
            m.for === "scene"
              ? { ...prev, sceneWaits: ([0, 1] as Seat[]).filter((s) => !m.ready.includes(s)) }
              : { ...prev, nextRoundReady: m.ready },
          );
          break;
        case "presence":
          setS((prev) => ({ ...prev, online: m.online, returnBy: m.returnBy ?? [null, null] }));
          break;
        case "forfeit":
          setS((prev) => ({ ...prev, forfeitedBy: m.seat }));
          break;
        case "emote":
          setS((prev) => ({ ...prev, emote: { seat: m.seat, emote: m.emote, key: Date.now() } }));
          break;
        case "rematchOffer":
          setS((prev) => (prev.rematch === "waiting" ? prev : { ...prev, rematch: "offered" }));
          break;
        case "rematchWaiting":
          setS((prev) => ({ ...prev, rematch: "waiting" }));
          break;
        case "error":
          setS((prev) => ({ ...prev, error: m.message }));
          break;
      }
    });
    // Subscribe now and after every reconnect; the server answers with the full current state.
    const stopOpen = socket.onOpen(() => socket.send({ t: "watch", gameId, carryOn: true }));
    return () => {
      // Off to the harbour: the socket may stay open for challenges, but nobody is watching.
      if (serverWaits.current) socket.send({ t: "leftTable", gameId });
      stopOpen();
      stopListening();
      release();
    };
  }, [gameId]);
  const carryOn = useCallback(() => {
    if (serverWaits.current) socket.send({ t: "carryOn", gameId });
  }, [gameId]);

  if (!s.p) return { loading: true, error: s.error };
  return {
    p: s.p,
    names: s.names,
    level: null,
    act: (action: UiAction) => socket.send({ t: "act", gameId, action }),
    error: s.error,
    ranked: true,
    reward: s.reward,
    online: {
      avatars: s.avatars,
      ranked: s.ranked,
      emote: s.emote,
      sendEmote: (emote: Emote) => socket.send({ t: "emote", gameId, emote }),
      rematch: s.rematch,
      requestRematch: () => socket.send({ t: "rematch", gameId }),
      rematchGameId: s.rematchGameId,
      deadline: s.deadline,
      online: s.online,
      returnBy: s.returnBy,
      nextRoundReady: s.nextRoundReady,
      sceneWaits: s.sceneWaits,
      carryOn,
      forfeitedBy: s.forfeitedBy,
      forfeit: () => socket.send({ t: "forfeit", gameId }),
    },
  };
}
