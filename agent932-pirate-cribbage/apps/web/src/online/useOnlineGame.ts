import { useEffect, useState } from "react";
import type { Seat } from "@pirate/engine";
import { initialPresentation, present } from "../game/present.js";
import type { GameController, Presentation, UiAction } from "../game/types.js";
import type { StateMessage } from "./protocol.js";
import { socket } from "./socket.js";

interface OnlineState {
  p: Presentation | null;
  names: [string, string];
  deadline: number | null;
  online: [boolean, boolean];
  nextRoundReady: Seat[];
  forfeitedBy: Seat | null;
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
    deadline: null,
    online: [true, true],
    nextRoundReady: [],
    forfeitedBy: null,
    error: null,
  });

  useEffect(() => {
    const release = socket.use();
    const stopListening = socket.listen((m) => {
      if ("gameId" in m && m.gameId !== gameId) return;
      switch (m.t) {
        case "state":
          setS((prev) => {
            const names = namesFor(m);
            const base = prev.p ?? initialPresentation(m.step.view);
            return {
              ...prev,
              p: present(base, m.step.events, m.step.view, names),
              names,
              deadline: m.deadline,
              online: m.online,
              nextRoundReady: m.nextRoundReady,
              error: null,
            };
          });
          break;
        case "waiting":
          setS((prev) => ({ ...prev, nextRoundReady: m.ready }));
          break;
        case "presence":
          setS((prev) => ({ ...prev, online: m.online }));
          break;
        case "forfeit":
          setS((prev) => ({ ...prev, forfeitedBy: m.seat }));
          break;
        case "error":
          setS((prev) => ({ ...prev, error: m.message }));
          break;
      }
    });
    // Subscribe now and after every reconnect; the server answers with the full current state.
    const stopOpen = socket.onOpen(() => socket.send({ t: "watch", gameId }));
    return () => {
      stopOpen();
      stopListening();
      release();
    };
  }, [gameId]);

  if (!s.p) return { loading: true, error: s.error };
  return {
    p: s.p,
    names: s.names,
    level: null,
    act: (action: UiAction) => socket.send({ t: "act", gameId, action }),
    error: s.error,
    ranked: true,
    online: {
      deadline: s.deadline,
      online: s.online,
      nextRoundReady: s.nextRoundReady,
      forfeitedBy: s.forfeitedBy,
      forfeit: () => socket.send({ t: "forfeit", gameId }),
    },
  };
}
