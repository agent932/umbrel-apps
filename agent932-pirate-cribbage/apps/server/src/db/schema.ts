import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { GameState, PowerUse, RuleSet } from "@pirate/engine";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // Case-insensitive uniqueness: "CaroS" and "caros" are the same pirate.
    uniqueIndex("users_username_lower").on(sql`lower(${t.username})`),
    uniqueIndex("users_email_lower").on(sql`lower(${t.email})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token; the token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/** Games in progress (and finished ones, until cleaned up). The full engine state lives here. */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").$type<"ai">().notNull(),
    aiLevel: text("ai_level").$type<"easy" | "medium" | "hard">(),
    state: jsonb("state").$type<GameState>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("games_user_active").on(t.userId, t.finishedAt)],
);

/** One finished match. `id` matches the game it came from. */
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey(),
  mode: text("mode").$type<"ai" | "online">().notNull(),
  aiLevel: text("ai_level").$type<"easy" | "medium" | "hard">(),
  variant: text("variant").$type<"classic" | "pirate">().notNull(),
  rules: jsonb("rules").$type<RuleSet>().notNull(),
  firstDealer: smallint("first_dealer").notNull(),
  winner: smallint("winner").notNull(),
  skunk: smallint("skunk").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
});

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    seat: smallint("seat").notNull(),
    /** Null for the computer. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    finalScore: integer("final_score").notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.seat] }), index("match_players_user").on(t.userId)],
);

export const rounds = pgTable(
  "rounds",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    roundNo: smallint("round_no").notNull(),
    dealer: smallint("dealer").notNull(),
    cribOwner: smallint("crib_owner").notNull(),
    /** Card label, e.g. "5H". */
    cut: text("cut"),
    complete: boolean("complete").notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.roundNo] })],
);

export const roundPlayers = pgTable(
  "round_players",
  {
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    roundNo: smallint("round_no").notNull(),
    seat: smallint("seat").notNull(),
    dealt: text("dealt").array().notNull(),
    discarded: text("discarded").array().notNull(),
    kept: text("kept").array().notNull(),
    pegPoints: smallint("peg_points").notNull(),
    handPoints: smallint("hand_points").notNull(),
    cribPoints: smallint("crib_points"),
    heelsPoints: smallint("heels_points").notNull(),
    pirateBonus: smallint("pirate_bonus").notNull(),
    powers: jsonb("powers").$type<PowerUse[]>().notNull(),
    /** Hand analyzer score 0–100 (phase 4). */
    analyzerScore: real("analyzer_score"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.roundNo, t.seat] })],
);
