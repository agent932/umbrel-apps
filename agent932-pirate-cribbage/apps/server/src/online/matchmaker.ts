import { randomBytes } from "node:crypto";
import { CLASSIC_RULES, PIRATE_RULES, type RuleSet } from "@pirate/engine";
import type { Menu } from "./protocol.js";
import { type Client, RoomError, type RoomManager } from "./rooms.js";

export interface Seeker {
  userId: string;
  username: string;
  client: Client;
}

export function rulesFor(menu: Menu): RuleSet {
  if (menu.variant === "classic") return CLASSIC_RULES;
  return { ...PIRATE_RULES, pirate: { ...PIRATE_RULES.pirate!, powerCost: menu.powerCost } };
}

const menuKey = (m: Menu) => `${m.variant}:${m.variant === "pirate" ? m.powerCost : 0}`;
const INVITE_TTL_MS = 60 * 60 * 1000;

/** Quick Match queues (one per rule set) and invite codes. In memory: they only matter while people wait. */
export class Matchmaker {
  private queues = new Map<string, Seeker>();
  private invites = new Map<string, { host: Seeker; menu: Menu; expires: number }>();

  constructor(private rooms: RoomManager) {}

  /** Pair with whoever is waiting for the same rules, or wait. Returns the new game id when paired. */
  async queue(seeker: Seeker, menu: Menu): Promise<string | null> {
    this.cancel(seeker.client);
    const key = menuKey(menu);
    const waiting = this.queues.get(key);
    if (!waiting || waiting.userId === seeker.userId) {
      this.queues.set(key, seeker);
      seeker.client.send({ t: "queued" });
      return null;
    }
    this.queues.delete(key);
    const gameId = await this.rooms.create(waiting, seeker, rulesFor(menu));
    waiting.client.send({ t: "matched", gameId });
    seeker.client.send({ t: "matched", gameId });
    return gameId;
  }

  createInvite(host: Seeker, menu: Menu): string {
    this.cancel(host.client);
    // Short, unambiguous code (no 0/O, 1/I).
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
    this.invites.set(code, { host, menu, expires: Date.now() + INVITE_TTL_MS });
    host.client.send({ t: "invite", code });
    return code;
  }

  async joinInvite(guest: Seeker, code: string): Promise<string> {
    const invite = this.invites.get(code.toUpperCase());
    if (!invite || invite.expires < Date.now())
      throw new RoomError("That invite has expired or was cancelled");
    if (invite.host.userId === guest.userId)
      throw new RoomError("You can't join your own invite — send the link to a friend");
    this.invites.delete(code.toUpperCase());
    const gameId = await this.rooms.create(invite.host, guest, rulesFor(invite.menu));
    invite.host.client.send({ t: "matched", gameId });
    guest.client.send({ t: "matched", gameId });
    return gameId;
  }

  /** Forget anything this connection was waiting for (it cancelled, or disconnected). */
  cancel(client: Client) {
    for (const [key, s] of this.queues) if (s.client === client) this.queues.delete(key);
    for (const [code, inv] of this.invites)
      if (inv.host.client === client) this.invites.delete(code);
  }
}
