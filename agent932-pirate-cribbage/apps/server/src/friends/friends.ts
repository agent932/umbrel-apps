import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { friendships, users } from "../db/schema.js";

export interface FriendEntry {
  id: string;
  username: string;
  rating: number;
}

export class FriendError extends Error {}

const pair = (a: string, b: string) =>
  or(
    and(eq(friendships.userId, a), eq(friendships.friendId, b)),
    and(eq(friendships.userId, b), eq(friendships.friendId, a)),
  );

export async function areFriends(db: Db, a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ status: friendships.status })
    .from(friendships)
    .where(and(pair(a, b), eq(friendships.status, "accepted")));
  return !!row;
}

/** Your friends, requests you've received, and requests you've sent. */
export async function listFriends(db: Db, me: string) {
  const rows = await db
    .select({
      userId: friendships.userId,
      friendId: friendships.friendId,
      status: friendships.status,
      id: users.id,
      username: users.username,
      rating: users.rating,
    })
    .from(friendships)
    .innerJoin(
      users,
      sql`${users.id} = case when ${friendships.userId} = ${me} then ${friendships.friendId} else ${friendships.userId} end`,
    )
    .where(or(eq(friendships.userId, me), eq(friendships.friendId, me)));
  const entry = (r: (typeof rows)[number]): FriendEntry => ({
    id: r.id,
    username: r.username,
    rating: r.rating,
  });
  const byName = (a: FriendEntry, b: FriendEntry) => a.username.localeCompare(b.username);
  return {
    friends: rows
      .filter((r) => r.status === "accepted")
      .map(entry)
      .sort(byName),
    incoming: rows
      .filter((r) => r.status === "pending" && r.friendId === me)
      .map(entry)
      .sort(byName),
    outgoing: rows
      .filter((r) => r.status === "pending" && r.userId === me)
      .map(entry)
      .sort(byName),
  };
}

/**
 * Send a friend request by username. If they had already asked you, this accepts it instead.
 * Returns the other player and whether you're now friends.
 */
export async function requestFriend(db: Db, me: string, username: string) {
  const [them] = await db
    .select({ id: users.id, username: users.username, rating: users.rating })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username.trim()})`);
  if (!them) throw new FriendError("No pirate by that name");
  if (them.id === me) throw new FriendError("You're already your own best mate");
  const [existing] = await db.select().from(friendships).where(pair(me, them.id));
  if (existing?.status === "accepted")
    throw new FriendError(`You and ${them.username} are already friends`);
  if (existing && existing.userId === me)
    throw new FriendError(`Already waiting for ${them.username} to accept`);
  if (existing) {
    await db.update(friendships).set({ status: "accepted" }).where(pair(me, them.id));
    return { friend: them, accepted: true };
  }
  await db.insert(friendships).values({ userId: me, friendId: them.id, status: "pending" });
  return { friend: them, accepted: false };
}

export async function acceptFriend(db: Db, me: string, from: string) {
  const res = await db
    .update(friendships)
    .set({ status: "accepted" })
    .where(
      and(
        eq(friendships.userId, from),
        eq(friendships.friendId, me),
        eq(friendships.status, "pending"),
      ),
    )
    .returning();
  if (res.length === 0) throw new FriendError("No request from that pirate");
}

/** Decline a request, cancel one you sent, or unfriend. */
export async function removeFriend(db: Db, me: string, other: string) {
  await db.delete(friendships).where(pair(me, other));
}
