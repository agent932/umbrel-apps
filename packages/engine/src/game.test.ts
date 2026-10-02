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
  PIRATE_RULES,
  POWERS,
  type RuleSet,
  chooseDiscard,
  chooseParley,
  choosePlay,
  redactEvent,
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

describe("pirate rules", () => {
  // Board and cut twists only, so these rounds don't stop for the pre-play power step.
  const BOARD_RULES: RuleSet = { ...PIRATE_RULES, pirate: { ...PIRATE_RULES.pirate!, powers: [] } };
  const pirate = (scores: [number, number]) => ({ ...createGame(0, BOARD_RULES), scores });

  it("digs up treasure when landing exactly on a treasure hole", () => {
    // The pone's go point moves them from 29 to 30.
    const { state, events } = run(pirate([0, 29]), [...SETUP, ...PEGGING.slice(0, 3)]);
    expect(events).toContainEqual({ type: "treasure", seat: 1, points: 3, hole: 30 });
    expect(state.scores[1]).toBe(33);
    expect(state.current!.seats[1]).toMatchObject({ pegPoints: 1, pirateBonus: 3 });
  });

  it("drags a peg back when landing on a kraken hole", () => {
    const { state, events } = run(pirate([0, 44]), [...SETUP, ...PEGGING.slice(0, 3)]);
    expect(events).toContainEqual({ type: "kraken", seat: 1, points: -4, hole: 45 });
    expect(state.scores[1]).toBe(41);
  });

  it("ignores holes that are passed over and classic games", () => {
    expect(run(pirate([0, 28]), [...SETUP, ...PEGGING.slice(0, 3)]).state.scores[1]).toBe(29);
    const classic = { ...createGame(0), scores: [0, 29] as [number, number] };
    expect(run(classic, [...SETUP, ...PEGGING.slice(0, 3)]).state.scores[1]).toBe(30);
  });

  it("lets the pone steal the crib when the Black Spot (A♠) is cut", () => {
    const deck = stackDeck("10S 10H 10D 5C 2C 3C", "KS KH KD 9C 4C AH", "AS");
    const { state, events } = run(createGame(0, BOARD_RULES), [
      { type: "deal", deck },
      ...SETUP.slice(1),
      ...PEGGING,
    ]);
    expect(events).toContainEqual({ type: "blackSpot", seat: 1 });
    const crib = events.find((e) => e.type === "crib");
    expect(crib).toMatchObject({ seat: 1 });
    expect(state.history[0]!.seats[1].cribPoints).toBe(
      crib!.type === "crib" ? crib!.score.total : -1,
    );
    expect(state.history[0]!.seats[0].cribPoints).toBeNull();
  });

  it("only applies the Black Spot under pirate rules", () => {
    const deck = stackDeck("10S 10H 10D 5C 2C 3C", "KS KH KD 9C 4C AH", "AS");
    const { events } = run(createGame(0), [{ type: "deal", deck }, ...SETUP.slice(1), ...PEGGING]);
    expect(events.find((e) => e.type === "crib")).toMatchObject({ seat: 0 });
  });
});

describe("pirate powers", () => {
  const dealt = run(createGame(0, PIRATE_RULES), [{ type: "deal", deck: DECK }]).state;
  const discards = SETUP.slice(1, 3);

  it("Parley swaps a card for the top of the deck, once per game", () => {
    const { state, events } = run(dealt, [{ type: "parley", seat: 1, card: parseCard("2C") }]);
    expect(state.hands[1]).toEqual(parseCards("10S 10H 10D 5C 7D 3C"));
    expect(state.deck.at(-1)).toEqual(parseCard("2C"));
    expect(state.deck).toHaveLength(40);
    expect(state.powersUsed).toEqual([[], ["parley"]]);
    expect(state.current!.seats[1].powers).toEqual([
      { power: "parley", cost: 0, gave: parseCards("2C"), got: parseCards("7D") },
    ]);
    expect(events).toEqual([
      {
        type: "power",
        seat: 1,
        power: "parley",
        cost: 0,
        gave: parseCards("2C"),
        got: parseCards("7D"),
      },
    ]);
    expect(viewFor(state, 1).powersLeft).not.toContain("parley");
    expect(viewFor(state, 0).opponentPowersLeft).not.toContain("parley");
    expect(() => applyAction(state, { type: "parley", seat: 1, card: parseCard("3C") })).toThrow(
      /Already used/,
    );
  });

  it("hides private power details from the opponent", () => {
    const { events } = run(dealt, [{ type: "parley", seat: 1, card: parseCard("2C") }]);
    expect(redactEvent(events[0]!, 0)).toEqual({
      type: "power",
      seat: 1,
      power: "parley",
      cost: 0,
    });
    expect(redactEvent(events[0]!, 1)).toEqual(events[0]);
  });

  it("Spyglass shows the opponent's hand, only to the user", () => {
    const { state, events } = run(dealt, [{ type: "spyglass", seat: 1 }]);
    expect(viewFor(state, 1).spied).toEqual(parseCards("KS KH KD 9C 4C AH"));
    expect(viewFor(state, 0).spied).toBeNull();
    expect(redactEvent(events[0]!, 0)).not.toHaveProperty("got");
  });

  it("Crow's Nest reveals the cut early, then play skips the cut step", () => {
    const { state, events } = run(dealt, [{ type: "crowsNest", seat: 0 }, ...discards]);
    expect(events[0]).toMatchObject({ type: "power", power: "crowsNest" });
    expect(events).toContainEqual({ type: "cut", card: parseCard("7D") });
    // Both still hold their after-the-cut powers, so they're asked if they're ready.
    expect(state.phase).toBe("preplay");
    expect(viewFor(state, 1).cut).toEqual(parseCard("7D"));
    expect(state.deck.some((c) => cardLabel(c) === "7D")).toBe(false);
    expect(() => applyAction(state, { type: "cut" })).toThrow(IllegalActionError);
  });

  it("waits for both players in pre-play, then the pone leads", () => {
    let { state } = run(dealt, [...discards, { type: "cut" }]);
    expect(state.phase).toBe("preplay");
    expect(toAct(state)).toEqual([0, 1]);
    state = applyAction(state, { type: "ready", seat: 0 }).state;
    expect(toAct(state)).toEqual([1]);
    state = applyAction(state, { type: "ready", seat: 1 }).state;
    expect(state.phase).toBe("pegging");
    expect(toAct(state)).toEqual([1]);
  });

  it("skips pre-play when nobody has an after-the-cut power", () => {
    const noPreplay: RuleSet = {
      ...PIRATE_RULES,
      pirate: { ...PIRATE_RULES.pirate!, powers: ["spyglass", "parley", "belay"] },
    };
    const { state } = run(createGame(0, noPreplay), SETUP);
    expect(state.phase).toBe("pegging");
  });

  it("Pickpocket swaps a card blind and lets the victim respond", () => {
    let { state } = run(dealt, [...discards, { type: "cut" }]);
    // Pone gives 5C and takes the dealer's card at position 0 (KS).
    state = applyAction(state, {
      type: "pickpocket",
      seat: 1,
      card: parseCard("5C"),
      index: 0,
    }).state;
    expect(state.hands[1]).toEqual(parseCards("10S 10H 10D KS"));
    expect(state.hands[0]).toEqual(parseCards("5C KH KD 9C"));
    expect(state.current!.seats[0].kept).toEqual(parseCards("5C KH KD 9C"));
    // Dealer can still answer with their own pickpocket or rebury.
    expect(toAct(state)).toEqual([0, 1]);
    state = run(state, [
      { type: "ready", seat: 0 },
      { type: "ready", seat: 1 },
    ]).state;
    // Play out the round; hands score with the traded cards.
    const { events } = run(state, [
      play(1, "10S"),
      play(0, "KH"),
      play(1, "10H"),
      play(0, "5C"),
      play(1, "10D"),
      play(0, "KD"),
      play(1, "KS"),
      play(0, "9C"),
    ]);
    const hands = events.filter((e) => e.type === "hand");
    expect(hands.map((e) => e.cards.map(cardLabel).join(" "))).toEqual([
      "10S 10H 10D KS",
      "5C KH KD 9C",
    ]);
  });

  it("Rebury changes the crib discards after the cut", () => {
    let { state } = run(dealt, [...discards, { type: "cut" }]);
    state = applyAction(state, { type: "rebury", seat: 1, cards: parseCards("10S 3C") }).state;
    expect(state.hands[1]).toEqual(parseCards("10H 10D 5C 2C"));
    expect(state.crib.map(cardLabel).sort()).toEqual(["10S", "3C", "4C", "AH"].sort());
    expect(state.current!.seats[1]).toMatchObject({
      discarded: parseCards("10S 3C"),
      kept: parseCards("10H 10D 5C 2C"),
    });
    expect(() =>
      applyAction(state, { type: "rebury", seat: 0, cards: parseCards("10S 3C") }),
    ).toThrow(IllegalActionError);
  });

  it("Belay That! takes back a play, including its points, until the opponent plays", () => {
    const pegging = run(dealt, [
      ...discards,
      { type: "cut" },
      { type: "ready", seat: 0 },
      { type: "ready", seat: 1 },
    ]).state;
    // Dealer plays KS after 10S; pone could belay their own 10S before that, not after.
    let s = applyAction(pegging, play(1, "10S")).state;
    expect(viewFor(s, 1).powersNow).toContain("belay");
    s = applyAction(s, play(0, "KS")).state;
    expect(viewFor(s, 1).powersNow).not.toContain("belay");

    // Dealer belays KS: the count goes back to 10 and it's the dealer's turn again.
    const { state, events } = run(s, [{ type: "belay", seat: 0 }]);
    expect(events[0]).toEqual({ type: "belayed", seat: 0, card: parseCard("KS") });
    expect(state.pegging!.count).toBe(10);
    expect(state.pegging!.turn).toBe(0);
    expect(state.hands[0]).toContainEqual(parseCard("KS"));
    expect(state.powersUsed[0]).toEqual(["belay"]);
    expect(() => applyAction(state, { type: "belay", seat: 0 })).toThrow(IllegalActionError);
  });

  it("charges points when powers have a cost", () => {
    const costly: RuleSet = { ...PIRATE_RULES, pirate: { ...PIRATE_RULES.pirate!, powerCost: 2 } };
    const broke = run(createGame(0, costly), [{ type: "deal", deck: DECK }]).state;
    expect(() => applyAction(broke, { type: "spyglass", seat: 1 })).toThrow(/Costs 2/);
    const rich = { ...broke, scores: [0, 10] as [number, number] };
    const { state } = run(rich, [{ type: "spyglass", seat: 1 }]);
    expect(state.scores[1]).toBe(8);
    expect(state.current!.seats[1].pirateBonus).toBe(-2);
  });

  it("are refused in classic games", () => {
    const classic = run(createGame(0), [{ type: "deal", deck: DECK }]).state;
    expect(() => applyAction(classic, { type: "spyglass", seat: 1 })).toThrow(/Not in play/);
    expect(viewFor(classic, 1).powersNow).toEqual([]);
  });
});

const pickOne = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

/** Now and then, use a random available power with random choices (fuzzing the power rules). */
function randomPower(state: GameState, random: () => number): Action | null {
  for (const seat of [0, 1] as Seat[]) {
    const now = viewFor(state, seat).powersNow;
    if (now.length === 0 || random() > 0.2) continue;
    const hand = state.hands[seat];
    switch (pickOne(now, random)) {
      case "spyglass":
        return { type: "spyglass", seat };
      case "crowsNest":
        return { type: "crowsNest", seat, index: Math.floor(random() * state.deck.length) };
      case "parley":
        return { type: "parley", seat, card: pickOne(hand, random) };
      case "pickpocket":
        return {
          type: "pickpocket",
          seat,
          card: pickOne(hand, random),
          index: Math.floor(random() * state.hands[other(seat)].length),
        };
      case "rebury": {
        const pool = shuffle([...hand, ...state.current!.seats[seat].discarded], random);
        return { type: "rebury", seat, cards: pool.slice(0, 2) };
      }
      case "belay":
        return { type: "belay", seat };
    }
  }
  return null;
}

/** Every card is exactly one place: a hand, the crib, the deck, the cut, or played. */
function checkCardsConserved(state: GameState) {
  if (state.phase === "deal" || state.phase === "gameOver") return;
  const all = [
    ...state.hands[0],
    ...state.hands[1],
    ...state.crib,
    ...state.deck,
    ...(state.cut ? [state.cut] : []),
    ...(state.pegging?.played.map((p) => p.card) ?? []),
  ].map(cardLabel);
  if (state.phase === "roundEnd") return; // pegging cleared; hands are counted from the record
  expect(new Set(all).size).toBe(52);
  expect(all).toHaveLength(52);
}

/** Play a whole game between two bots; returns the final state. */
function botGame(seed: number, rules?: RuleSet): GameState {
  const random = seededRandom(seed);
  let state = createGame(random() < 0.5 ? 0 : 1, rules);
  for (let steps = 0; steps < 10_000; steps++) {
    if (rules?.pirate) {
      checkCardsConserved(state);
      const power = randomPower(state, random);
      if (power) {
        state = applyAction(state, power).state;
        continue;
      }
    }
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
        const isDealer = seat === state.dealer;
        const swap = viewFor(state, seat).powersNow.includes("parley")
          ? chooseParley(state.hands[seat], isDealer)
          : null;
        if (swap) {
          state = applyAction(state, { type: "parley", seat, card: swap }).state;
          continue;
        }
        action = {
          type: "discard",
          seat,
          cards: chooseDiscard(state.hands[seat], seat === state.dealer),
        };
        break;
      }
      case "preplay":
        action = { type: "ready", seat: toAct(state)[0]! };
        break;
      case "pegging": {
        const seat = state.pegging!.turn;
        action = { type: "play", seat, card: choosePlay(viewFor(state, seat)) };
        break;
      }
    }
    const before = state.scores;
    state = applyAction(state, action).state;
    // Scores only go up, except when the kraken drags a peg back.
    if (!rules?.pirate) {
      expect(state.scores[0]).toBeGreaterThanOrEqual(before[0]);
      expect(state.scores[1]).toBeGreaterThanOrEqual(before[1]);
    }
  }
  throw new Error("Game did not finish");
}

describe("simulated bot games", () => {
  const games = [
    ...Array.from({ length: 200 }, (_, i) => botGame(i + 1)),
    ...Array.from({ length: 200 }, (_, i) => botGame(i + 1000, PIRATE_RULES)),
  ];

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
        return (
          sum + s.pegPoints + s.handPoints + (s.cribPoints ?? 0) + s.heelsPoints + s.pirateBonus
        );
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

  it("exercise every pirate twist", () => {
    const pirateRounds = games.filter((g) => g.rules.pirate).flatMap((g) => g.history);
    expect(pirateRounds.some((r) => r.seats.some((s) => s.pirateBonus > 0))).toBe(true);
    expect(pirateRounds.some((r) => r.seats.some((s) => s.pirateBonus < 0))).toBe(true);
    const used = new Set(
      pirateRounds.flatMap((r) => r.seats.flatMap((s) => s.powers.map((u) => u.power))),
    );
    expect([...used].sort()).toEqual([...POWERS].sort());
    expect(pirateRounds.some((r) => r.cribOwner !== r.dealer)).toBe(true);
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
