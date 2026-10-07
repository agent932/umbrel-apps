import type { FastifyInstance } from "fastify";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import {
  type Card,
  analyzeDiscard,
  cardLabel,
  dailyDeal,
  parseCard,
  sameCard,
} from "@pirate/engine";
import { parseBody, requireUser } from "../auth/routes.js";
import type { Db } from "../db/client.js";
import { achievements, dailyResults } from "../db/schema.js";
import { payDaily } from "../economy/earn.js";
import { lockWallets } from "../economy/wallet.js";
import type { Tx } from "../games/record.js";

/** Best throws in a row that earn Sharp Eye. */
export const SHARP_EYE_DAYS = 7;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-04" moved by `days` (UTC calendar arithmetic, so no daylight-saving surprises). */
export function addDays(day: string, days: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const utcToday = () => new Date().toISOString().slice(0, 10);

/**
 * Puzzle days the server will take. Players use their own time zone's date, which is always
 * within a day of UTC, so that's yesterday, today or tomorrow in UTC. Older days are closed.
 */
export function isOpenDay(day: string, today = utcToday()) {
  if (!DAY.test(day) || addDays(day, 0) !== day) return false;
  return day >= addDays(today, -1) && day <= addDays(today, 1);
}

const DailyBody = z.object({
  day: z.string().refine((d) => isOpenDay(d), "That puzzle is closed. Try today's."),
  cards: z.array(z.string().max(4)).length(2, "Throw two cards"),
});

interface DailyResult {
  day: string;
  /** The two cards thrown, as labels ("5H"). */
  discard: [string, string];
  best: boolean;
  /** 0 = the worst of the 15 throws, 100 = the best. */
  score: number;
  /** 1 = the best throw (ties share a place), up to 15. */
  rank: number;
  bestDiscard: [string, string];
}

/** Rank a throw against that day's deal, which the server deals itself. */
function judge(day: string, cards: Card[]): DailyResult {
  const { hand, isDealer } = dailyDeal(day);
  const a = analyzeDiscard(hand, cards, isDealer);
  const rank = 1 + a.choices.filter((c) => c.ev > a.chosen.ev + 1e-9).length;
  const labels = (d: readonly Card[]) => [cardLabel(d[0]!), cardLabel(d[1]!)] as [string, string];
  return {
    day,
    discard: labels(a.chosen.discard),
    best: rank === 1,
    score: a.score,
    rank,
    bestDiscard: labels(a.best.discard),
  };
}

/**
 * Best throws in a row, ending on `day` or the day before. If `day` was played and missed, the
 * streak is broken (0); if it hasn't been played yet, yesterday's streak still stands.
 */
async function streak(exec: Tx | Db, userId: string, day: string) {
  const rows = await exec
    .select({ day: dailyResults.day, best: dailyResults.best })
    .from(dailyResults)
    .where(and(eq(dailyResults.userId, userId), lte(dailyResults.day, day)))
    .orderBy(desc(dailyResults.day))
    .limit(400);
  const byDay = new Map(rows.map((r) => [r.day, r.best]));
  let d = byDay.has(day) ? day : addDays(day, -1);
  let count = 0;
  while (byDay.get(d) === true) {
    count++;
    d = addDays(d, -1);
  }
  return count;
}

/** The daily discard for signed-in players: one answer a day, kept on the server. */
export async function dailyRoutes(app: FastifyInstance, { db }: { db: Db }) {
  async function stored(userId: string, day: string): Promise<DailyResult | null> {
    const [row] = await db
      .select()
      .from(dailyResults)
      .where(and(eq(dailyResults.userId, userId), eq(dailyResults.day, day)));
    return row ? judge(day, [parseCard(row.card1), parseCard(row.card2)]) : null;
  }

  /** Today's answer if you've played (on any device), and your best-throw streak. */
  app.get<{ Querystring: { day?: string } }>(
    "/api/daily",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return;
      // The player's own date when they send it; UTC otherwise.
      const day = req.query.day && isOpenDay(req.query.day) ? req.query.day : utcToday();
      return { day, result: await stored(user.id, day), streak: await streak(db, user.id, day) };
    },
  );

  /** Throw two cards. The first answer for a day is the one that counts, and pays doubloons. */
  app.post(
    "/api/daily",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = requireUser(req, reply);
      if (!user) return;
      const body = parseBody(DailyBody, req.body, reply);
      if (!body) return;
      const { hand } = dailyDeal(body.day);
      let cards: Card[];
      try {
        cards = body.cards.map(parseCard);
      } catch {
        return reply.code(400).send({ error: "Those aren't cards from today's hand" });
      }
      if (sameCard(cards[0]!, cards[1]!) || !cards.every((c) => hand.some((h) => sameCard(h, c)))) {
        return reply.code(400).send({ error: "Those aren't cards from today's hand" });
      }
      const result = judge(body.day, cards);
      // The answer, any achievement and the doubloons are saved together, or not at all.
      const out = await db.transaction(async (tx) => {
        await lockWallets(tx, [user.id]);
        const added = await tx
          .insert(dailyResults)
          .values({
            userId: user.id,
            day: body.day,
            card1: result.discard[0],
            card2: result.discard[1],
            best: result.best,
          })
          .onConflictDoNothing()
          .returning({ day: dailyResults.day });
        if (!added.length) return null;
        const count = await streak(tx, user.id, body.day);
        const unlocked: string[] = [];
        if (count >= SHARP_EYE_DAYS) {
          const won = await tx
            .insert(achievements)
            .values({ userId: user.id, key: "sharpEye" })
            .onConflictDoNothing()
            .returning({ key: achievements.key });
          unlocked.push(...won.map((w) => w.key));
        }
        const reward = await payDaily(tx, user.id, body.day, result.best, unlocked);
        return { count, unlocked, reward };
      });
      if (!out) return reply.code(409).send({ error: "You've already played that day's hand" });
      return { result, streak: out.count, unlocked: out.unlocked, reward: out.reward };
    },
  );
}
