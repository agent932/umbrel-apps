import { and, eq, isNull, or, sql } from "drizzle-orm";
import {
  type Action,
  type GameEvent,
  type GameState,
  type RuleSet,
  type Seat,
  applyAction,
  botAction,
  createDeck,
  hostAction,
  newGame,
  cryptoRandom,
  other,
  rateGame,
  redactEvent,
  shuffle,
  tierFor,
  toAct,
  viewFor,
} from "@pirate/engine";
import type { Db } from "../db/client.js";
import { games, users } from "../db/schema.js";
import type { ClientAction } from "../games/actions.js";
import { type RatingChange, type Tx, recordMatch } from "../games/record.js";
import { toEngineAction } from "../games/toEngine.js";
import { currentSeason } from "../seasons/seasons.js";
import type { Emote, ServerMessage } from "./protocol.js";

/** The shortest gap between one player's emotes. */
const EMOTE_GAP_MS = 2500;

export interface Timing {
  /** Time to make a move before the server makes a sensible one for you. */
  turnMs: number;
  /** Time on the round summary before the next round starts anyway. */
  nextRoundMs: number;
  /** Time to reconnect before forfeiting (5 minutes: long enough to step away or switch apps). */
  disconnectMs: number;
}

export const DEFAULT_TIMING: Timing = {
  turnMs: 60_000,
  nextRoundMs: 30_000,
  disconnectMs: 5 * 60_000,
};

/** Anything that can receive messages: a WebSocket in production, a fake in tests. */
export interface Client {
  send(message: ServerMessage): void;
  /** Hang up (e.g. the account was disabled). Test clients may leave this out. */
  close?(code: number, reason: string): void;
}

interface Player {
  userId: string;
  username: string;
  avatar?: number | null;
}

export class RoomError extends Error {}

/** One online game in memory. All changes go through `run`, so moves are applied one at a time. */
class Room {
  readonly clients: [Set<Client>, Set<Client>] = [new Set(), new Set()];
  nextRoundVotes = new Set<Seat>();
  /** When each seat last called out an emote (rate limit). */
  lastEmote: [number, number] = [0, 0];
  turnTimer: ReturnType<typeof setTimeout> | null = null;
  deadline: number | null = null;
  disconnectTimers: [ReturnType<typeof setTimeout> | null, ReturnType<typeof setTimeout> | null] = [
    null,
    null,
  ];
  /** When each disconnected player forfeits unless they're back (ms since epoch), or null. */
  returnBy: [number | null, number | null] = [null, null];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly id: string,
    readonly players: [Player, Player],
    public state: GameState,
    readonly createdAt: Date,
    readonly ranked: boolean,
  ) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  seatOf(userId: string): Seat | null {
    if (this.players[0].userId === userId) return 0;
    if (this.players[1].userId === userId) return 1;
    return null;
  }

  online(seat: Seat) {
    return this.clients[seat].size > 0;
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(
    private db: Db,
    private timing: Timing = DEFAULT_TIMING,
    /** Called when a player's clock to come back starts (for the opt-in email notice). */
    private onAway?: (userId: string, opponent: string, gameId: string) => void,
  ) {}

  /** Start a game between two players. Seats are assigned at random, as is the first dealer. */
  async create(a: Player, b: Player, rules: RuleSet, ranked = false): Promise<string> {
    const players: [Player, Player] = cryptoRandom() < 0.5 ? [a, b] : [b, a];
    // Both players cut the deck to see who deals first; the house shuffles for them.
    let state = newGame(rules);
    state = applyAction(
      state,
      hostAction(state, () => shuffle(createDeck(), cryptoRandom))!,
    ).state;
    const [row] = await this.db
      .insert(games)
      .values({
        userId: players[0].userId,
        user2Id: players[1].userId,
        mode: "online",
        state,
        ranked,
      })
      .returning({ id: games.id, createdAt: games.createdAt });
    const room = new Room(row!.id, players, state, row!.createdAt, ranked);
    this.rooms.set(room.id, room);
    this.schedule(room);
    return room.id;
  }

  /** Find a room in memory, or reload an unfinished one from the database (e.g. after a restart). */
  private async load(gameId: string): Promise<Room | null> {
    const cached = this.rooms.get(gameId);
    if (cached) return cached;
    const [row] = await this.db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.mode, "online"), isNull(games.finishedAt)));
    if (!row || !row.user2Id) return null;
    const people = await this.db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(or(eq(users.id, row.userId), eq(users.id, row.user2Id)));
    const name = (id: string) => people.find((p) => p.id === id)?.username ?? "Pirate";
    const avatar = (id: string) => people.find((p) => p.id === id)?.avatar ?? null;
    const room = new Room(
      row.id,
      [
        { userId: row.userId, username: name(row.userId), avatar: avatar(row.userId) },
        { userId: row.user2Id, username: name(row.user2Id), avatar: avatar(row.user2Id) },
      ],
      row.state,
      row.createdAt,
      row.ranked,
    );
    this.rooms.set(room.id, room);
    this.schedule(room);
    return room;
  }

  /** Unfinished online games for a player, for "Resume". */
  async activeFor(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: games.id })
      .from(games)
      .where(
        and(
          eq(games.mode, "online"),
          isNull(games.finishedAt),
          or(eq(games.userId, userId), eq(games.user2Id, userId)),
        ),
      );
    return rows.map((r) => r.id);
  }

  /** Connect a client to their seat and send them the current state. */
  async join(gameId: string, userId: string, client: Client): Promise<void> {
    const room = await this.load(gameId);
    if (!room) throw new RoomError("That game isn't running");
    const seat = room.seatOf(userId);
    if (seat === null) throw new RoomError("You're not in that game");
    await room.run(async () => {
      const wasOnline = room.online(seat);
      room.clients[seat].add(client);
      if (room.disconnectTimers[seat]) {
        clearTimeout(room.disconnectTimers[seat]!);
        room.disconnectTimers[seat] = null;
      }
      room.returnBy[seat] = null;
      this.sendState(room, seat, client, []);
      if (!wasOnline) this.broadcastPresence(room);
    });
  }

  /** A client went away. If that seat has no connections left, start the forfeit clock. */
  leave(gameId: string, client: Client) {
    const room = this.rooms.get(gameId);
    if (!room) return;
    void room.run(async () => {
      for (const seat of [0, 1] as Seat[]) {
        if (!room.clients[seat].delete(client) || room.online(seat)) continue;
        this.awayClock(room, seat);
      }
    });
  }

  /** A player who isn't connected yet (a friend joined their invite while they were away). */
  startAwayClock(gameId: string, userId: string) {
    const room = this.rooms.get(gameId);
    const seat = room?.seatOf(userId);
    if (!room || seat == null) return;
    void room.run(async () => {
      if (!room.online(seat) && !room.disconnectTimers[seat]) this.awayClock(room, seat);
    });
  }

  private awayClock(room: Room, seat: Seat) {
    if (room.state.phase !== "gameOver") {
      this.onAway?.(room.players[seat].userId, room.players[other(seat)].username, room.id);
    }
    room.returnBy[seat] = Date.now() + this.timing.disconnectMs;
    this.broadcastPresence(room);
    room.disconnectTimers[seat] = setTimeout(() => {
      void room.run(() => this.forfeit(room, seat));
    }, this.timing.disconnectMs);
  }

  async act(gameId: string, userId: string, action: ClientAction): Promise<void> {
    const room = await this.load(gameId);
    if (!room) throw new RoomError("That game isn't running");
    const seat = room.seatOf(userId);
    if (seat === null) throw new RoomError("You're not in that game");
    if (action.type === "continue") return;
    await room.run(async () => {
      if (room.state.phase === "gameOver") throw new RoomError("The game is over");
      if (action.type === "nextRound") return this.voteNextRound(room, seat);
      await this.apply(room, toEngineAction(room.state, seat, action));
    });
  }

  /** Pass a quick call-out ("Arr!") to both players. At most one every few seconds each. */
  async emote(gameId: string, userId: string, emote: Emote): Promise<void> {
    const room = this.rooms.get(gameId);
    const seat = room?.seatOf(userId);
    if (!room || seat == null) throw new RoomError("You're not in that game");
    const now = Date.now();
    if (now - room.lastEmote[seat] < EMOTE_GAP_MS) return;
    room.lastEmote[seat] = now;
    this.broadcast(room, () => ({ t: "emote", gameId, seat, emote }));
  }

  /** Who played a finished online game and how, for a rematch. Null if it isn't one. */
  async rematchInfo(gameId: string) {
    const [row] = await this.db
      .select()
      .from(games)
      .where(and(eq(games.id, gameId), eq(games.mode, "online")));
    if (!row || !row.user2Id || !row.finishedAt) return null;
    const people = await this.db
      .select({ id: users.id, username: users.username, avatar: users.avatar })
      .from(users)
      .where(or(eq(users.id, row.userId), eq(users.id, row.user2Id)));
    const player = (id: string) => {
      const p = people.find((x) => x.id === id);
      return { userId: id, username: p?.username ?? "Pirate", avatar: p?.avatar ?? null };
    };
    return {
      players: [player(row.userId), player(row.user2Id)] as const,
      rules: row.state.rules,
      ranked: row.ranked,
    };
  }

  async forfeitByUser(gameId: string, userId: string): Promise<void> {
    const room = await this.load(gameId);
    const seat = room?.seatOf(userId);
    if (!room || seat == null) throw new RoomError("You're not in that game");
    await room.run(() => this.forfeit(room, seat));
  }

  /** Both players see the show; the next round starts when both are ready (or time runs out). */
  private async voteNextRound(room: Room, seat: Seat) {
    if (room.state.phase !== "roundEnd") throw new RoomError("The round isn't over");
    room.nextRoundVotes.add(seat);
    if (room.nextRoundVotes.size < 2) {
      this.broadcast(room, () => ({
        t: "waiting",
        gameId: room.id,
        for: "nextRound",
        ready: [...room.nextRoundVotes],
      }));
      return;
    }
    await this.apply(room, { type: "nextRound" });
  }

  /** Apply a move (throws IllegalActionError for bad ones), deal if needed, tell everyone, save. */
  private async apply(room: Room, action: Action) {
    const events: GameEvent[] = [];
    let { state } = room;
    const step = (a: Action) => {
      const result = applyAction(state, a);
      state = result.state;
      events.push(...result.events);
    };
    step(action);
    if (state.phase === "deal") room.nextRoundVotes.clear();
    // The house deals, or reshuffles after a tied cut for deal.
    for (let house = hostAction(state, () => shuffle(createDeck(), cryptoRandom)); house;) {
      step(house);
      house = hostAction(state, () => shuffle(createDeck(), cryptoRandom));
    }
    room.state = state;

    const finished = state.phase === "gameOver";
    await this.db
      .update(games)
      .set({ state, updatedAt: new Date(), finishedAt: finished ? new Date() : null })
      .where(eq(games.id, room.id));
    if (finished) await this.finish(room, null);

    for (const seat of [0, 1] as Seat[]) {
      for (const client of room.clients[seat]) this.sendState(room, seat, client, events);
    }
    if (!finished) this.schedule(room);
  }

  /** Give the game to the other player. */
  private async forfeit(room: Room, seat: Seat) {
    if (room.state.phase === "gameOver") return;
    const state = structuredClone(room.state);
    state.winner = other(seat);
    state.skunk = 0;
    state.phase = "gameOver";
    state.pegging = null;
    // An unfinished round isn't in the history yet; keep it so its cards still count for stats.
    if (state.current && !state.current.complete) {
      state.history.push(state.current);
    }
    room.state = state;
    await this.db
      .update(games)
      .set({ state, updatedAt: new Date(), finishedAt: new Date() })
      .where(eq(games.id, room.id));
    await this.finish(room, seat);
    const events: GameEvent[] = [{ type: "gameOver", winner: other(seat), skunk: 0 }];
    for (const s of [0, 1] as Seat[]) {
      for (const client of room.clients[s]) {
        client.send({ t: "forfeit", gameId: room.id, seat });
        this.sendState(room, s, client, events);
      }
    }
  }

  private async finish(room: Room, forfeitedBy: Seat | null) {
    this.clearTimers(room);
    await this.db.transaction(async (tx) => {
      const ratings = room.ranked ? await this.rate(tx, room) : null;
      const seasonId = room.ranked ? (await currentSeason(tx)).id : null;
      await recordMatch(
        tx,
        {
          id: room.id,
          mode: "online",
          aiLevel: null,
          createdAt: room.createdAt,
          ranked: room.ranked,
          seasonId,
        },
        [room.players[0].userId, room.players[1].userId],
        room.state,
        forfeitedBy,
        ratings,
      );
    });
    this.rooms.delete(room.id);
  }

  /** Update both players' Elo ratings (rows locked, so two games ending at once can't clash). */
  private async rate(tx: Tx, room: Room): Promise<RatingChange[]> {
    const rows = await tx
      .select({ id: users.id, rating: users.rating })
      .from(users)
      .where(or(eq(users.id, room.players[0].userId), eq(users.id, room.players[1].userId)))
      .for("update");
    const seats = [0, 1] as Seat[];
    const before = seats.map((s) => rows.find((r) => r.id === room.players[s].userId)!.rating);
    const w = room.state.winner!;
    const result = rateGame(before[w]!, before[other(w)]!);
    const after = seats.map((s) => (s === w ? result.winner : result.loser));
    for (const s of seats) {
      await tx
        .update(users)
        .set({ rating: after[s]!, rankedGames: sql`${users.rankedGames} + 1` })
        .where(eq(users.id, room.players[s].userId));
    }
    return seats.map((s) => ({
      before: before[s]!,
      after: after[s]!,
      tier: tierFor(before[s]!).key,
    }));
  }

  /** Restart the move clock. When it runs out, the server moves for whoever is holding things up. */
  private schedule(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    const waitingOnRound = room.state.phase === "roundEnd";
    const ms = waitingOnRound ? this.timing.nextRoundMs : this.timing.turnMs;
    room.deadline = Date.now() + ms;
    room.turnTimer = setTimeout(() => {
      void room
        .run(async () => {
          if (room.state.phase === "gameOver") return;
          if (room.state.phase === "roundEnd") return this.apply(room, { type: "nextRound" });
          for (const seat of toAct(room.state)) {
            const move = botAction(room.state, seat, "medium", cryptoRandom);
            if (!move) continue;
            this.broadcast(room, () => ({ t: "timeout", gameId: room.id, seat }));
            await this.apply(room, move);
            // One move per timeout; the clock restarts for whoever is next.
            return;
          }
        })
        .catch(() => undefined);
    }, ms);
  }

  private clearTimers(room: Room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    for (const t of room.disconnectTimers) if (t) clearTimeout(t);
    room.turnTimer = null;
    room.disconnectTimers = [null, null];
  }

  private sendState(room: Room, seat: Seat, client: Client, events: GameEvent[]) {
    client.send({
      t: "state",
      gameId: room.id,
      seat,
      names: [room.players[0].username, room.players[1].username],
      avatars: [room.players[0].avatar ?? null, room.players[1].avatar ?? null],
      ranked: room.ranked,
      step: { events: events.map((e) => redactEvent(e, seat)), view: viewFor(room.state, seat) },
      deadline: room.state.phase === "gameOver" ? null : room.deadline,
      online: [room.online(0), room.online(1)],
      returnBy: room.returnBy,
      nextRoundReady: [...room.nextRoundVotes],
    });
  }

  private broadcast(room: Room, message: () => ServerMessage) {
    for (const seat of [0, 1] as Seat[])
      for (const client of room.clients[seat]) client.send(message());
  }

  private broadcastPresence(room: Room) {
    this.broadcast(room, () => ({
      t: "presence",
      gameId: room.id,
      online: [room.online(0), room.online(1)],
      returnBy: room.returnBy,
    }));
  }

  /** Games in memory right now, for the admin page. */
  list() {
    return [...this.rooms.values()].map((r) => ({
      id: r.id,
      players: r.players.map((p) => p.username),
      online: [r.online(0), r.online(1)],
      scores: r.state.scores,
      round: r.state.round,
      phase: r.state.phase,
      ranked: r.ranked,
      variant: r.state.rules.pirate ? "pirate" : "classic",
      startedAt: r.createdAt,
    }));
  }

  /** End a game without recording it (an admin clearing a stuck game). */
  async abort(gameId: string): Promise<boolean> {
    const room = await this.load(gameId);
    if (!room) return false;
    await room.run(async () => {
      this.clearTimers(room);
      await this.db.update(games).set({ finishedAt: new Date() }).where(eq(games.id, room.id));
      this.broadcast(room, () => ({
        t: "error",
        gameId: room.id,
        message: "An admin ended this game",
      }));
      this.rooms.delete(room.id);
    });
    return true;
  }

  /** Stop all timers (server shutdown, tests). Games stay saved and resume on next load. */
  close() {
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
  }
}
