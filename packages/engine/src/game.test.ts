import { describe, expect, it } from "vitest";
import {
  type Action,
  type Card,
  type GameEvent,
  type GameState,
  IllegalActionError,
  type Seat,
  applyAction,
  cardLabel,
  chooseDiscard,
  choosePlay,
  createDeck,
  createGame,
  other,
  parseCard,
  parseCards,
  seededRandom,
  shuffle,
  toAct,
  viewFor,
} from "./index.js";

/**
 * Build a deck so the deal gives these exact hands. Cards alternate pone, dealer, pone, …
 * `top` follows the 12 dealt cards (it becomes the cut with `cut index 0`).
 */
function stackDeck(pone: string, dealer: string, top: string): Card[] {
  const p = parseCards(pone);
  const d = parseCards(dealer);
  const first = [...p.flatMap((c, i) => [c, d[i]!]), parseCard(top)];
  const used = new Set(first.map(cardLabel));
  return [...first, ...createDeck().filter((c) => !used.has(cardLabel(c)))];
}

function run(state: GameState, actions: Action[]) {
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const play = (seat: Seat, card: string): Action => ({ type: "play", seat, card: parseCard(card) });

// Dealer is seat 0, pone is seat 1.
const DECK = stackDeck("10S 10H 10D 5C 2C 3C", "KS KH KD 9C 4C AH", "7D");
const SETUP: Action[] = [
  { type: "deal", deck: DECK },
  { type: "discard", seat: 1, cards: parseCards("2C 3C") },
  { type: "discard", seat: 0, cards: parseCards("4C AH") },
  { type: "cut" },
];
const PEGGING: Action[] = [
  play(1, "10S"), // 10
  play(0, "KS"), // 20
  play(1, "10H"), // 30; dealer can't play, pone can't play → go to pone, reset
  play(0, "KH"), // 10
  play(1, "10D"), // 20
  play(0, "KD"), // 30; go to dealer, reset
  play(1, "5C"), // 5
  play(0, "9C"), // 14; last card to dealer
];

describe("a scripted round", () => {
  it("deals 6 each, pone first, and waits for discards", () => {
    const { state } = run(createGame(0), [{ type: "deal", deck: DECK }]);
    expect(state.phase).toBe("discard");
    expect(state.hands[1]).toEqual(parseCards("10S 10H 10D 5C 2C 3C"));
    expect(state.hands[0]).toEqual(parseCards("KS KH KD 9C 4C AH"));
    expect(toAct(state)).toEqual([0, 1]);
  });

  it("cuts after both discard, then the pone leads", () => {
    const { state } = run(createGame(0), SETUP);
    expect(state.cut).toEqual(parseCard("7D"));
    expect(state.crib).toHaveLength(4);
    expect(state.phase).toBe("pegging");
    expect(toAct(state)).toEqual([1]);
  });

  it("handles go, resets and last card automatically", () => {
    const { events } = run(createGame(0), [...SETUP, ...PEGGING]);
    const pegEvents = events.filter((e) => e.type === "go" || e.type === "lastCard");
    expect(pegEvents).toEqual([
      { type: "go", seat: 1, points: 1 },
      { type: "go", seat: 0, points: 1 },
      { type: "lastCard", seat: 0, points: 1 },
    ]);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(2);
  });

  it("counts pone hand, dealer hand, then crib, and records the round", () => {
    const { state, events } = run(createGame(0), [...SETUP, ...PEGGING]);
    const shows = events.filter((e) => e.type === "hand" || e.type === "crib");
    expect(shows.map((e) => [e.type, e.seat, e.score.total])).toEqual([
      ["hand", 1, 12], // three tens and a five: 6 for fifteens + 6 for pairs
      ["hand", 0, 6], // three kings
      ["crib", 0, 6], // A-2-3-4 run + one fifteen (A+3+4+7)
    ]);
    expect(state.phase).toBe("roundEnd");
    expect(state.scores).toEqual([14, 13]);

    const rec = state.history[0]!;
    expect(rec).toMatchObject({ round: 1, dealer: 0, complete: true });
    expect(rec.seats[1]).toMatchObject({ pegPoints: 1, handPoints: 12, cribPoints: null });
    expect(rec.seats[0]).toMatchObject({ pegPoints: 2, handPoints: 6, cribPoints: 6 });
    expect(rec.seats[1].discarded).toEqual(parseCards("2C 3C"));
  });

  it("passes the deal to the other player for the next round", () => {
    const { state } = run(createGame(0), [...SETUP, ...PEGGING, { type: "nextRound" }]);
    expect(state.phase).toBe("deal");
    expect(state.dealer).toBe(1);
  });
});

describe("game end", () => {
  it("ends mid-pegging the moment someone reaches 121, with a double skunk", () => {
    const start = { ...createGame(0), scores: [0, 120] as [number, number] };
    const { state, events } = run(start, [...SETUP, ...PEGGING.slice(0, 3)]);
    expect(state.phase).toBe("gameOver");
    expect(state.winner).toBe(1);
    expect(state.scores).toEqual([0, 121]);
    expect(state.skunk).toBe(2);
    expect(events.at(-1)).toEqual({ type: "gameOver", winner: 1, skunk: 2 });
    expect(state.history[0]!.complete).toBe(false);
    expect(() => applyAction(state, play(0, "KH"))).toThrow(IllegalActionError);
  });

  it("lets the pone win on their hand before the dealer counts", () => {
    const start = { ...createGame(0), scores: [100, 108] as [number, number] };
    const { state, events } = run(start, [...SETUP, ...PEGGING]);
    expect(state.winner).toBe(1);
    expect(events.some((e) => e.type === "hand" && e.seat === 0)).toBe(false);
    expect(state.skunk).toBe(0);
  });

  it("marks a single skunk when the loser is below 91", () => {
    const start = { ...createGame(0), scores: [80, 120] as [number, number] };
    const { state } = run(start, [...SETUP, ...PEGGING.slice(0, 3)]);
    expect(state.skunk).toBe(1);
  });

  it("gives the dealer 2 for his heels when a jack is cut", () => {
    const deck = stackDeck("10S 10H 10D 5C 2C 3C", "KS KH KD 9C 4C AH", "JD");
    const { state, events } = run(createGame(0), [{ type: "deal", deck }, ...SETUP.slice(1)]);
    expect(events).toContainEqual({ type: "heels", seat: 0, points: 2 });
    expect(state.scores).toEqual([2, 0]);
    expect(state.current!.seats[0].heelsPoints).toBe(2);
  });
});

describe("illegal moves", () => {
  const pegging = run(createGame(0), SETUP).state;

  it.each<[string, GameState, Action]>([
    ["playing out of turn", pegging, play(0, "KS")],
    ["playing a card not held", pegging, play(1, "KS")],
    ["dealing twice", pegging, { type: "deal", deck: DECK }],
    ["discarding during pegging", pegging, { type: "discard", seat: 0, cards: [] }],
    ["a short deck", createGame(0), { type: "deal", deck: DECK.slice(1) }],
    [
      "a deck with duplicates",
      createGame(0),
      { type: "deal", deck: [DECK[0]!, ...DECK.slice(0, 51)] },
    ],
    ["nextRound mid-round", pegging, { type: "nextRound" }],
  ])("rejects %s", (_name, state, action) => {
    expect(() => applyAction(state, action)).toThrow(IllegalActionError);
  });

  it("rejects going over 31 but allows a card that fits", () => {
    const at25 = structuredClone(pegging);
    at25.pegging!.count = 25;
    expect(() => applyAction(at25, play(1, "10S"))).toThrow(IllegalActionError);
    expect(() => applyAction(at25, play(1, "5C"))).not.toThrow();
  });

  it("rejects discarding cards not held or the wrong number", () => {
    const dealt = run(createGame(0), [{ type: "deal", deck: DECK }]).state;
    expect(() =>
      applyAction(dealt, { type: "discard", seat: 0, cards: parseCards("2C 3C") }),
    ).toThrow(IllegalActionError);
    expect(() => applyAction(dealt, { type: "discard", seat: 0, cards: parseCards("KS") })).toThrow(
      IllegalActionError,
    );
    expect(() =>
      applyAction(dealt, { type: "discard", seat: 0, cards: parseCards("KS KS") }),
    ).toThrow(IllegalActionError);
  });

  it("never mutates the input state", () => {
    const before = structuredClone(pegging);
    applyAction(pegging, play(1, "10S"));
    expect(pegging).toEqual(before);
  });
});

describe("viewFor", () => {
  it("hides the opponent's hand and the deck", () => {
    const { state } = run(createGame(0), SETUP);
    const view = viewFor(state, 1);
    expect(view.hand).toEqual(parseCards("10S 10H 10D 5C"));
    expect(view.opponentCardCount).toBe(4);
    expect(JSON.stringify(view)).not.toContain('"rank":13'); // no kings leak from the dealer's hand
    expect(view).not.toHaveProperty("deck");
    expect(view).not.toHaveProperty("crib");
  });
});

/** Play a whole game between two bots; returns the final state. */
function botGame(seed: number): GameState {
  const random = seededRandom(seed);
  let state = createGame(random() < 0.5 ? 0 : 1);
  for (let steps = 0; steps < 10_000; steps++) {
    let action: Action;
    switch (state.phase) {
      case "gameOver":
        return state;
      case "deal":
        action = { type: "deal", deck: shuffle(createDeck(), random) };
        break;
      case "roundEnd":
        action = { type: "nextRound" };
        break;
      case "cut":
        action = { type: "cut", index: Math.floor(random() * state.deck.length) };
        break;
      case "discard": {
        const seat = toAct(state)[0]!;
        action = {
          type: "discard",
          seat,
          cards: chooseDiscard(state.hands[seat], seat === state.dealer),
        };
        break;
      }
      case "pegging": {
        const seat = state.pegging!.turn;
        action = { type: "play", seat, card: choosePlay(viewFor(state, seat)) };
        break;
      }
    }
    const before = state.scores;
    state = applyAction(state, action).state;
    expect(state.scores[0]).toBeGreaterThanOrEqual(before[0]);
    expect(state.scores[1]).toBeGreaterThanOrEqual(before[1]);
  }
  throw new Error("Game did not finish");
}

describe("simulated bot games", () => {
  const games = Array.from({ length: 300 }, (_, i) => botGame(i + 1));

  it("always finish with exactly one winner at the target score", () => {
    for (const g of games) {
      expect(g.phase).toBe("gameOver");
      expect(g.scores[g.winner!]).toBe(121);
      expect(g.scores[other(g.winner!)]).toBeLessThan(121);
    }
  });

  it("record rounds whose points add up to the loser's final score", () => {
    for (const g of games) {
      const loser = other(g.winner!);
      const total = g.history.reduce((sum, r) => {
        const s = r.seats[loser];
        return sum + s.pegPoints + s.handPoints + (s.cribPoints ?? 0) + s.heelsPoints;
      }, 0);
      expect(total).toBe(g.scores[loser]);
    }
  });

  it("deal 12 distinct cards each round and alternate the dealer", () => {
    for (const g of games) {
      g.history.forEach((r, i) => {
        const dealt = [...r.seats[0].dealt, ...r.seats[1].dealt].map(cardLabel);
        expect(new Set(dealt).size).toBe(12);
        expect(r.dealer).toBe(i % 2 === 0 ? g.firstDealer : other(g.firstDealer));
      });
    }
  });

  it("produce realistic averages (sanity check on scoring)", () => {
    const rounds = games.flatMap((g) => g.history.filter((r) => r.complete));
    const hands = rounds.flatMap((r) => r.seats.map((s) => s.handPoints));
    const avg = hands.reduce((a, b) => a + b, 0) / hands.length;
    // Real-world hand average is about 7–8 points (your Online stats: 7.37).
    expect(avg).toBeGreaterThan(6);
    expect(avg).toBeLessThan(9.5);
  });
});
