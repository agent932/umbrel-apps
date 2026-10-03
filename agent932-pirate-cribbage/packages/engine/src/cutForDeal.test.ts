import { describe, expect, it } from "vitest";
import {
  type Card,
  type GameState,
  IllegalActionError,
  applyAction,
  botAction,
  cardLabel,
  createDeck,
  hostAction,
  newGame,
  parseCard,
  seededRandom,
  shuffle,
  toAct,
  viewFor,
} from "./index.js";

/** A deck with the given cards first, so picks 0 and 1 land on them. */
function stacked(first: string[]): Card[] {
  const top = first.map(parseCard);
  const used = new Set(top.map(cardLabel));
  return [...top, ...createDeck().filter((c) => !used.has(cardLabel(c)))];
}

const shuffled = (deck: Card[]): GameState =>
  applyAction(newGame(), { type: "shuffleForCut", deck }).state;

describe("cut for deal", () => {
  it("waits for the house to shuffle, then for both players to pick", () => {
    const fresh = newGame();
    expect(fresh.phase).toBe("cutForDeal");
    expect(toAct(fresh)).toEqual([]);
    expect(hostAction(fresh, createDeck)).toMatchObject({ type: "shuffleForCut" });
    const ready = shuffled(createDeck());
    expect(toAct(ready)).toEqual([0, 1]);
    expect(hostAction(ready, createDeck)).toBeNull();
    expect(viewFor(ready, 0).cutForDeal).toEqual({ deckSize: 52, taken: [], cards: [null, null] });
  });

  it("gives the first deal to the lower card, aces low", () => {
    let s = shuffled(stacked(["KH", "AS"]));
    s = applyAction(s, { type: "pickCut", seat: 0, index: 0 }).state;
    expect(toAct(s)).toEqual([1]);
    const { state, events } = applyAction(s, { type: "pickCut", seat: 1, index: 1 });
    expect(state.phase).toBe("deal");
    expect(state.dealer).toBe(1);
    expect(state.firstDealer).toBe(1);
    expect(events.at(-1)).toEqual({
      type: "cutForDealt",
      cards: [parseCard("KH"), parseCard("AS")],
      dealer: 1,
    });
    // The two cards stay visible for the "who deals" reveal.
    expect(viewFor(state, 0).cutForDeal?.cards).toEqual([parseCard("KH"), parseCard("AS")]);
    expect(hostAction(state, createDeck)).toMatchObject({ type: "deal" });
  });

  it("reshuffles and cuts again on a tie", () => {
    let s = shuffled(stacked(["7H", "7S"]));
    s = applyAction(s, { type: "pickCut", seat: 0, index: 0 }).state;
    const { state, events } = applyAction(s, { type: "pickCut", seat: 1, index: 1 });
    expect(events.at(-1)).toEqual({ type: "cutTie", cards: [parseCard("7H"), parseCard("7S")] });
    expect(state.phase).toBe("cutForDeal");
    expect(hostAction(state, createDeck)).toMatchObject({ type: "shuffleForCut" });
  });

  it("refuses the same card twice, a second pick, and picks off the deck", () => {
    let s = shuffled(createDeck());
    s = applyAction(s, { type: "pickCut", seat: 0, index: 5 }).state;
    expect(viewFor(s, 1).cutForDeal?.taken).toEqual([5]);
    expect(() => applyAction(s, { type: "pickCut", seat: 1, index: 5 })).toThrow(/already taken/);
    expect(() => applyAction(s, { type: "pickCut", seat: 0, index: 6 })).toThrow(/already cut/);
    expect(() => applyAction(s, { type: "pickCut", seat: 1, index: 52 })).toThrow(
      IllegalActionError,
    );
    expect(() => applyAction(newGame(), { type: "pickCut", seat: 0, index: 0 })).toThrow(
      IllegalActionError,
    );
  });

  it("lets bots cut and gets a game going", () => {
    const random = seededRandom(3);
    let s = newGame();
    for (let i = 0; i < 20 && s.phase === "cutForDeal"; i++) {
      const action =
        hostAction(s, () => shuffle(createDeck(), random)) ??
        botAction(s, toAct(s)[0]!, "medium", random)!;
      s = applyAction(s, action).state;
    }
    expect(s.phase).toBe("deal");
    const [a, b] = s.cutForDeal!.cards;
    expect(s.dealer).toBe(a!.rank < b!.rank ? 0 : 1);
  });
});
