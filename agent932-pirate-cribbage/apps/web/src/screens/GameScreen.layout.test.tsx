import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CLASSIC_RULES, PIRATE_RULES, type RuleSet, botAction } from "@pirate/engine";
import { BOT, YOU, houseAction, names, newLocalGame, step } from "../game/localGame.js";
import type { GameController } from "../game/types.js";
import { GameScreen } from "./GameScreen.js";

/** A local game dealt and waiting for you to throw to the crib. */
function atDiscard(rules: RuleSet) {
  let game = newLocalGame({ level: "medium", rules });
  for (let i = 0; i < 50 && game.state.phase !== "discard"; i++) {
    const { state } = game;
    const move =
      houseAction(state) ?? botAction(state, YOU, "easy") ?? botAction(state, BOT, "easy");
    game = step(game, move!);
  }
  expect(game.state.phase).toBe("discard");
  const controller: GameController = {
    p: game.p,
    names: names("medium"),
    level: "medium",
    act: () => {},
    error: null,
    ranked: false,
  };
  return controller;
}

const show = (game: GameController) =>
  render(<GameScreen game={game} onExit={() => {}} onPlayAgain={() => {}} instant />);

describe("the table layout", () => {
  it("stands the powers in two columns when there are more than three, none in classic", () => {
    const pirate = atDiscard(PIRATE_RULES);
    const powers = pirate.p.view.rules.pirate!.powers.length;
    const { container, unmount } = show(pirate);
    const grid = container.querySelector(".table-grid")!;
    expect(grid).toHaveClass(powers > 3 ? "rail-two" : "rail-one");
    expect(container.querySelectorAll(".t-powers .t-round")).toHaveLength(powers);
    unmount();

    const { container: classic } = show(atDiscard(CLASSIC_RULES));
    expect(classic.querySelector(".table-grid")).toHaveClass("rail-none");
    expect(classic.querySelector(".t-powers")).toBeNull();
  });

  it("puts the opponent in the porthole, pins the dealer and sets the crib on the dealer's side", () => {
    const game = atDiscard(CLASSIC_RULES);
    const { container, getByLabelText } = show(game);
    const iDeal = game.p.view.dealer === game.p.view.seat;
    const opp = getByLabelText(game.names[1]);
    const you = getByLabelText(game.names[0]);
    expect(opp).toHaveClass("t-seat-port");
    expect(opp.querySelector(".t-porthole")).not.toBeNull();
    expect(you.querySelector(".t-avatar")).not.toBeNull();
    // The pin (and the word, for screen readers) is on the dealer only.
    const dealer = iDeal ? you : opp;
    const pone = iDeal ? opp : you;
    expect(dealer.querySelector(".t-dealer-pin")).not.toBeNull();
    expect(dealer).toHaveTextContent("dealer");
    expect(pone.querySelector(".t-dealer-pin")).toBeNull();
    expect(pone).not.toHaveTextContent("dealer");
    expect(container.querySelector(".t-crib")).toHaveClass(iDeal ? "mine" : "theirs");
  });

  it("keeps the action plank in its own fixed home", () => {
    const { container, getByRole } = show(atDiscard(CLASSIC_RULES));
    const plank = getByRole("button", { name: "Throw to crib" });
    expect(plank.parentElement).toHaveClass("t-act-home");
    expect(container.querySelector(".t-you .t-you-chip")).not.toBeNull();
  });

  it("shows the prompt and the latest log line in the big status pills", () => {
    const game = atDiscard(CLASSIC_RULES);
    const { container } = show(game);
    const status = container.querySelector(".t-status")!;
    const prompt = status.querySelector(".t-prompt")!;
    expect(prompt).toHaveTextContent(/^Throw two cards to/);
    expect(prompt).toHaveAttribute("aria-live", "polite");
    // Only the newest line sits under the prompt.
    expect(status.querySelectorAll(".t-log li")).toHaveLength(1);
    expect(status.querySelector(".t-log li")).toHaveTextContent(game.p.feed[0]!.text);
  });
});
