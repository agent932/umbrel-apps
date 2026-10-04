import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";
import { type Mailer, emailSettings, simpleEmail } from "./mailer.js";

/** At most one "your game is waiting" email per player in this long. */
const GAME_NOTICE_GAP_MS = 30 * 60_000;

/**
 * Opt-in email notices. Each one checks the player's choice and that email is set up, and never
 * throws: a failed email mustn't break the game.
 */
export class Notices {
  constructor(
    private db: Db,
    private mailer: Mailer,
    private log?: FastifyBaseLogger,
  ) {}

  private async send(
    userId: string,
    kind: "game" | "friends",
    build: (u: { username: string }) => {
      subject: string;
      lines: string[];
      path: string;
      label: string;
    },
  ) {
    try {
      const config = await emailSettings(this.db);
      if (!config) return;
      const [u] = await this.db.select().from(users).where(eq(users.id, userId));
      if (!u || u.disabledAt) return;
      if (kind === "game") {
        if (!u.notifyGame) return;
        if (u.notifiedGameAt && Date.now() - u.notifiedGameAt.getTime() < GAME_NOTICE_GAP_MS)
          return;
        await this.db.update(users).set({ notifiedGameAt: new Date() }).where(eq(users.id, userId));
      } else if (!u.notifyFriends) return;
      const m = build(u);
      const email = simpleEmail({
        to: u.email,
        subject: m.subject,
        lines: [
          ...m.lines,
          `You get these because you turned them on. Stop all of them: ${config.siteUrl}/api/email/unsubscribe/${u.unsubscribeToken}`,
        ],
        button: { label: m.label, url: `${config.siteUrl}${m.path}` },
      });
      await this.mailer(config, email);
    } catch (e) {
      this.log?.error(e);
    }
  }

  /** You left an online game and the clock to come back has started. */
  gameWaiting(userId: string, opponent: string, gameId: string) {
    void this.send(userId, "game", (u) => ({
      subject: `${opponent} is waiting for you at the cribbage table`,
      lines: [
        `Ahoy, ${u.username}! Your online game with ${opponent} is waiting for you.`,
        "Come back within 5 minutes or the game goes to them.",
      ],
      path: `/online/${gameId}`,
      label: "Back to the table",
    }));
  }

  /** Someone asked to join your crew. */
  friendRequest(userId: string, from: string) {
    void this.send(userId, "friends", (u) => ({
      subject: `${from} wants to join your crew`,
      lines: [`Ahoy, ${u.username}! ${from} sent you a friend request on Deckhand Games.`],
      path: "/friends",
      label: "See the request",
    }));
  }
}
