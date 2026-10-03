import a1 from "../assets/avatars/avatar-1.webp";
import a2 from "../assets/avatars/avatar-2.webp";
import a3 from "../assets/avatars/avatar-3.webp";
import a4 from "../assets/avatars/avatar-4.webp";
import a5 from "../assets/avatars/avatar-5.webp";
import a6 from "../assets/avatars/avatar-6.webp";
import a7 from "../assets/avatars/avatar-7.webp";
import a8 from "../assets/avatars/avatar-8.webp";

/** The painted crew portraits a player can pick (numbered 1-8, as the server stores them). */
export const AVATARS = [
  { id: 1, url: a1, name: "Red-haired captain" },
  { id: 2, url: a2, name: "Old sea dog" },
  { id: 3, url: a3, name: "Cabin girl" },
  { id: 4, url: a4, name: "Ship's cook" },
  { id: 5, url: a5, name: "Navigator" },
  { id: 6, url: a6, name: "First mate" },
  { id: 7, url: a7, name: "Skeleton" },
  { id: 8, url: a8, name: "Monkey" },
] as const;

export const avatarUrl = (id: number | null | undefined) =>
  AVATARS.find((a) => a.id === id)?.url ?? null;
