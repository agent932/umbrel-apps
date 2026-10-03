import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "pc_session";
export const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  rating: number;
  rankedGames: number;
  /** Painted crew portrait 1-8, or null for their initial. */
  avatar: number | null;
  isAdmin: boolean;
}

/** The columns a signed-in user (and the browser) gets to see. Never the password hash. */
export const userColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  rating: users.rating,
  rankedGames: users.rankedGames,
  avatar: users.avatar,
  isAdmin: users.isAdmin,
};

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function userForToken(db: Db, token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select(userColumns)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, new Date()),
        isNull(users.disabledAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Sign a user out everywhere, optionally keeping one session (the one changing the password). */
export async function deleteUserSessions(db: Db, userId: string, keepToken?: string) {
  await db
    .delete(sessions)
    .where(
      keepToken
        ? and(eq(sessions.userId, userId), ne(sessions.id, hashToken(keepToken)))
        : eq(sessions.userId, userId),
    );
}
