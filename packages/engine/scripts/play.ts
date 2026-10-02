// Play a game against the bot in the terminal: `npm run play`
import { createInterface } from "node:readline";
import {
  type Card,
  type GameEvent,
  type GameState,
  type Seat,
  IllegalActionError,
  applyAction,
  cardLabel,
  cardValue,
  chooseDiscard,
  choosePlay,
  createDeck,
  createGame,
  cryptoRandom,
  shuffle,
  viewFor,
} from "../src/index.js";

const YOU: Seat = 0;
const BOT: Seat = 1;
const rl = createInterface({ input: process.stdin });
// Buffered line reader: unlike rl.question it never drops lines typed (or piped) ahead of the prompt.
const lines = rl[Symbol.asyncIterator]();
async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  const next = await lines.next();
  if (next.done) {
    console.log("\nBye!");
    process.exit(0);
  }
  return next.value;
}
const name = (seat: Seat) => (seat === YOU ? "You" : "Cap'n Bot");
const whose = (seat: Seat) => (seat === YOU ? "Your" : "Cap'n Bot's");
const scores = (seat: Seat) => `${name(seat)} score${seat === YOU ? "" : "s"}`;
const show = (cards: readonly Card[]) =>
  cards.map((c, i) => `[${i + 1}] ${cardLabel(c)}`).join("  ");

function describe(e: GameEvent): string | null {
  switch (e.type) {
    case "cut":
      return `Cut card: ${cardLabel(e.card)}`;
    case "heels":
      return `${scores(e.seat)} 2 for his heels`;
    case "played": {
      const parts = Object.entries(e.score)
        .filter(([k, v]) => k !== "total" && v > 0)
        .map(([k, v]) => `${k} ${v}`);
      return `${name(e.seat)} played ${cardLabel(e.card)} — count ${e.count}${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    case "go":
      return `${scores(e.seat)} 1 for the go`;
    case "lastCard":
      return `${scores(e.seat)} 1 for last card`;
    case "reset":
      return "— count resets to 0 —";
    case "hand":
    case "crib":
      return `${whose(e.seat)} ${e.type}: ${e.cards.map(cardLabel).join(" ")} = ${e.score.total} (${
        Object.entries(e.score.points)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "nineteen!"
      })`;
    case "gameOver":
      return `\n☠️  ${name(e.winner)} win${e.winner === YOU ? "" : "s"}!${e.skunk ? (e.skunk === 2 ? " DOUBLE SKUNK!" : " Skunk!") : ""}`;
    default:
      return null;
  }
}

function step(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const { state: next, events } = applyAction(state, action);
  for (const e of events) {
    const line = describe(e);
    if (line) console.log(line);
  }
  return next;
}

async function pick(prompt: string, max: number, count: number): Promise<number[]> {
  for (;;) {
    const nums = (await ask(prompt))
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      nums.length === count &&
      nums.every((n) => n >= 1 && n <= max) &&
      new Set(nums).size === count
    )
      return nums.map((n) => n - 1);
    console.log(`Enter ${count} different number${count > 1 ? "s" : ""} from 1 to ${max}.`);
  }
}

let state = createGame(cryptoRandom() < 0.5 ? YOU : BOT);
console.log("🏴‍☠️  Pirate Cribbage — first to 121\n");

while (state.phase !== "gameOver") {
  switch (state.phase) {
    case "deal":
      console.log(
        `\n=== Round ${state.round + 1} — ${name(state.dealer)} deal${state.dealer === YOU ? "" : "s"} — Score: You ${state.scores[YOU]}, Bot ${state.scores[BOT]} ===`,
      );
      state = step(state, { type: "deal", deck: shuffle(createDeck(), cryptoRandom) });
      break;
    case "discard": {
      if (state.hands[BOT].length === 6)
        state = step(state, {
          type: "discard",
          seat: BOT,
          cards: chooseDiscard(state.hands[BOT], state.dealer === BOT),
        });
      const hand = state.hands[YOU];
      console.log(`Your hand: ${show(hand)}`);
      const idx = await pick(
        `Throw 2 to ${state.dealer === YOU ? "your" : "the bot's"} crib: `,
        6,
        2,
      );
      state = step(state, { type: "discard", seat: YOU, cards: idx.map((i) => hand[i]!) });
      break;
    }
    case "cut":
      state = step(state, { type: "cut", index: Math.floor(cryptoRandom() * state.deck.length) });
      break;
    case "pegging": {
      const peg = state.pegging!;
      if (peg.turn === BOT) {
        state = step(state, { type: "play", seat: BOT, card: choosePlay(viewFor(state, BOT)) });
        break;
      }
      const hand = state.hands[YOU];
      const legal = hand.map((c) => peg.count + cardValue(c) <= 31);
      console.log(`Count ${peg.count}. Your cards: ${show(hand)}`);
      const [i] = await pick("Play a card: ", hand.length, 1);
      if (!legal[i!]) {
        console.log("That would go over 31.");
        break;
      }
      try {
        state = step(state, { type: "play", seat: YOU, card: hand[i!]! });
      } catch (e) {
        if (e instanceof IllegalActionError) console.log(e.message);
        else throw e;
      }
      break;
    }
    case "roundEnd":
      await ask("Press Enter for the next round…");
      state = step(state, { type: "nextRound" });
      break;
  }
}

console.log(`Final score: You ${state.scores[YOU]}, Bot ${state.scores[BOT]}`);
rl.close();
