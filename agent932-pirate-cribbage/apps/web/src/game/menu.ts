import { type BotLevel, CLASSIC_RULES, PIRATE_RULES, type RuleSet } from "@pirate/engine";

/** What the player picks on the home screen; the server accepts exactly these choices. */
export interface MenuChoice {
  level: BotLevel;
  variant: "classic" | "pirate";
  powerCost: 0 | 2;
}

export function rulesFor(choice: MenuChoice): RuleSet {
  if (choice.variant === "classic") return CLASSIC_RULES;
  return { ...PIRATE_RULES, pirate: { ...PIRATE_RULES.pirate!, powerCost: choice.powerCost } };
}
