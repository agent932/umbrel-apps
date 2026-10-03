import type { BotLevel } from "@pirate/engine";
import salUrl from "../assets/avatars/avatar-3.webp";
import barnabyUrl from "../assets/avatars/avatar-2.webp";
import captainUrl from "../assets/table/captain.webp";

/** The computer opponents: who you're up against at each difficulty. */
export const BOT_CREW: Record<BotLevel, { name: string; title: string; portrait: string }> = {
  easy: { name: "Swabbie Sal", title: "Deckhand", portrait: salUrl },
  medium: { name: "Bosun Barnaby", title: "Bosun", portrait: barnabyUrl },
  hard: { name: "Cap'n Bot", title: "Captain", portrait: captainUrl },
};
