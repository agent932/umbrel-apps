import type { ServerMessage } from "./protocol.js";
import type { Client } from "./rooms.js";

/** Who is connected right now, and a way to reach them (challenges, friend requests). */
export class Presence {
  private byUser = new Map<string, Set<Client>>();

  add(userId: string, client: Client) {
    const set = this.byUser.get(userId) ?? new Set();
    set.add(client);
    this.byUser.set(userId, set);
  }

  remove(userId: string, client: Client) {
    const set = this.byUser.get(userId);
    set?.delete(client);
    if (set?.size === 0) this.byUser.delete(userId);
  }

  isOnline(userId: string) {
    return this.byUser.has(userId);
  }

  notify(userId: string, message: ServerMessage) {
    for (const c of this.byUser.get(userId) ?? []) c.send(message);
  }

  /** Hang up every connection a player has (their account was just disabled). */
  disconnect(userId: string, reason: string) {
    for (const c of this.byUser.get(userId) ?? []) {
      c.send({ t: "error", message: reason });
      c.close?.(4403, "disabled");
    }
  }
}
