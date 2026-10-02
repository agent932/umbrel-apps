import { and, eq, isNull } from "drizzle-orm";
import {
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type PlayerView,
  type RuleSet,
  type Seat,
  applyAction,
  botAction,
  createDeck,
  createGame,
  cryptoRandom,
  powerBlocker,
  redactEvent,
  shuffle,
  toAct,
  viewFor,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { games } from "../db/schema.js";
import type { ClientAction } from "./actions.js";
import { recordMatch } from "./record.js";
import { toEngineAction } from "./toEngine.js";

/** In games vs the computer, the person is always seat 0. */
export const HUMAN: Seat = 0;
export const COMPUTER: Seat = 1;

export interface Step {
  events: GameEvent[];
  view: PlayerView;
}

export interface GameResponse {
  gameId: string;
  level: BotLevel;
  steps: Step[];
}

export class GameNotFoundError extends Error {}

/** Apply one action and capture what the person is allowed to see of it. */
function apply(state: GameState, action: Action, steps: Step[]): GameState {
  const result = applyAction(state, action);
  steps.push({
    events: result.events.map((e) => redactEvent(e, HUMAN)),
    view: viewFor(result.state, HUMAN),
  });
  return result.state;
}

/**
 * Run the house (dealing) and the computer until the person has to act.
 * With `pauseForBelay`, stops before the computer plays over a card the person could still take back.
 */
function advance(
  state: GameState,
  level: BotLevel,
  steps: Step[],
  pauseForBelay: boolean,
): GameState {
  for (let guard = 0; guard < 500; guard++) {
    if (state.phase === "gameOver") return state;
    if (state.phase === "deal") {
      state = apply(state, { type: "deal", deck: shuffle(createDeck(), cryptoRandom) }, steps);
      continue;
    }
    if (
      pauseForBelay &&
      toAct(state).includes(COMPUTER) &&
      powerBlocker(state, HUMAN, "belay") === null
    ) {
      return state;
    }
    const move = botAction(state, COMPUTER, level, cryptoRandom);
    if (!move) return state;
    state = apply(state, move, steps);
  }
  throw new Error("Game loop did not settle");
}

export async function createAiGame(
  db: Db,
  userId: string,
  level: BotLevel,
  rules: RuleSet,
): Promise<GameResponse> {
  const steps: Step[] = [];
  const firstDealer: Seat = cryptoRandom() < 0.5 ? HUMAN : COMPUTER;
  let state = createGame(firstDealer, rules);
  steps.push({ events: [], view: viewFor(state, HUMAN) });
  state = advance(state, level, steps, false);

  return db.transaction(async (tx) => {
    // One game vs the computer at a time; starting a new one abandons the old (it isn't recorded).
    await tx
      .update(games)
      .set({ finishedAt: new Date() })
      .where(and(eq(games.userId, userId), isNull(games.finishedAt)));
    const [row] = await tx
      .insert(games)
      .values({ userId, mode: "ai", aiLevel: level, state })
      .returning({ id: games.id });
    return { gameId: row!.id, level, steps };
  });
}

export async function actInAiGame(
  db: Db,
  userId: string,
  gameId: string,
  input: ClientAction,
): Promise<GameResponse> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.userId, userId)))
      .for("update");
    if (!row || row.finishedAt) throw new GameNotFoundError();
    const level = row.aiLevel as BotLevel;

    const steps: Step[] = [];
    let state = row.state;
    const action = input.type === "continue" ? "continue" : toEngineAction(state, HUMAN, input);
    if (action === "continue") {
      state = advance(state, level, steps, false);
    } else {
      state = apply(state, action, steps);
      state = advance(state, level, steps, action.type === "play");
    }

    const finished = state.phase === "gameOver";
    await tx
      .update(games)
      .set({ state, updatedAt: new Date(), finishedAt: finished ? new Date() : null })
      .where(eq(games.id, gameId));
    if (finished)
      await recordMatch(
        tx,
        { id: row.id, mode: "ai", aiLevel: row.aiLevel, createdAt: row.createdAt },
        [userId, null],
        state,
      );
    return { gameId, level, steps };
  });
}

export async function activeAiGame(db: Db, userId: string): Promise<GameResponse | null> {
  const [row] = await db
    .select()
    .from(games)
    .where(and(eq(games.userId, userId), isNull(games.finishedAt)))
    .limit(1);
  if (!row) return null;
  return {
    gameId: row.id,
    level: row.aiLevel as BotLevel,
    steps: [{ events: [], view: viewFor(row.state, HUMAN) }],
  };
}

export async function abandonAiGame(db: Db, userId: string, gameId: string) {
  await db
    .update(games)
    .set({ finishedAt: new Date() })
    .where(and(eq(games.id, gameId), eq(games.userId, userId), isNull(games.finishedAt)));
}
