import { type Action, type GameState, type Seat, cryptoRandom, other } from "@pirate/engine";
import type { ClientAction } from "./actions.js";

const randomIndex = (n: number) => Math.floor(cryptoRandom() * n);

/**
 * Turn what a player sent into a full engine action for their seat. The seat is never taken from
 * the client, and anything random (cut position, which card a pickpocket grabs) is chosen here.
 */
export function toEngineAction(
  state: GameState,
  seat: Seat,
  a: Exclude<ClientAction, { type: "continue" }>,
): Action {
  switch (a.type) {
    case "cut":
      return { type: "cut", index: randomIndex(state.deck.length) };
    case "crowsNest":
      return { type: "crowsNest", seat, index: randomIndex(state.deck.length) };
    case "pickpocket":
      return {
        type: "pickpocket",
        seat,
        card: a.card,
        index: randomIndex(state.hands[other(seat)].length),
      };
    case "nextRound":
      return { type: "nextRound" };
    case "discard":
    case "rebury":
      return { type: a.type, seat, cards: a.cards };
    case "play":
    case "parley":
      return { type: a.type, seat, card: a.card };
    case "ready":
    case "spyglass":
    case "belay":
      return { type: a.type, seat };
  }
}
