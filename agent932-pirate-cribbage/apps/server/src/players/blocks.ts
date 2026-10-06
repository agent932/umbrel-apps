import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { friendships, playerBlocks, users } from "../db/schema.js";

export interface BlockedPlayer {
  id: string;
  username: string;
}

/** Find a player by username (any case). */
export async function playerByName(db: Db, username: string) {
  const [row] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username.trim()})`);
  return row ?? null;
}

/** Block a player: also ends any friendship or friend request between you. */
export async function blockPlayer(db: Db, me: string, them: string) {
  await db.insert(playerBlocks).values({ userId: me, blockedId: them }).onConflictDoNothing();
  await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, me), eq(friendships.friendId, them)),
        and(eq(friendships.userId, them), eq(friendships.friendId, me)),
      ),
    );
}

export async function unblockPlayer(db: Db, me: string, them: string) {
  await db
    .delete(playerBlocks)
    .where(and(eq(playerBlocks.userId, me), eq(playerBlocks.blockedId, them)));
}

/** The players you've blocked, by name. */
export async function listBlocked(db: Db, me: string): Promise<BlockedPlayer[]> {
  return db
    .select({ id: users.id, username: users.username })
    .from(playerBlocks)
    .innerJoin(users, eq(users.id, playerBlocks.blockedId))
    .where(eq(playerBlocks.userId, me))
    .orderBy(users.username);
}

/** Whether `blocker` has blocked `blocked` (one direction). */
export async function isBlocking(db: Db, blocker: string, blocked: string): Promise<boolean> {
  const [row] = await db
    .select({ id: playerBlocks.userId })
    .from(playerBlocks)
    .where(and(eq(playerBlocks.userId, blocker), eq(playerBlocks.blockedId, blocked)));
  return !!row;
}

/** Everyone you've blocked or who has blocked you: the players you're never paired with. */
export async function blockedEitherWay(db: Db, me: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: playerBlocks.userId, blockedId: playerBlocks.blockedId })
    .from(playerBlocks)
    .where(or(eq(playerBlocks.userId, me), eq(playerBlocks.blockedId, me)));
  return new Set(rows.map((r) => (r.userId === me ? r.blockedId : r.userId)));
}
