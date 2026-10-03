import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";

async function startGame(
  rules: "Classic" | "Pirate" = "Pirate",
  level: "Easy" | "Medium" = "Medium",
) {
  const user = userEvent.setup();
  render(<App botDelay={0} />);
  await user.click(screen.getByLabelText(new RegExp(`^${level}`)));
  await user.click(screen.getByLabelText(new RegExp(`^${rules}`)));
  await user.click(screen.getByRole("button", { name: /set sail/i }));
  await cutForDeal(user);
  return user;
}

/** Cut any card until the deal is decided (a tie means cutting again). */
async function cutForDeal(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 20; i++) {
    const free = screen
      .queryAllByRole("button", { name: /^Cut card/ })
      .filter((b) => !b.hasAttribute("disabled"));
    if (free.length) await user.click(free[0]!);
    if (screen.queryByLabelText("Your hand")) return;
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Your hand") ??
          screen.queryAllByRole("button", { name: /^Cut card/ })[0],
      ).toBeTruthy(),
    );
  }
}

const hand = () => within(screen.getByLabelText("Your hand"));

describe("playing vs the bot", () => {
  it("deals six cards and throws two to the crib", async () => {
    const user = await startGame("Classic");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));

    const throwBtn = screen.getByRole("button", { name: "Throw to crib" });
    expect(throwBtn).toBeDisabled();
    const [a, b] = hand().getAllByRole("button");
    await user.click(a!);
    await user.click(b!);
    expect(a).toHaveAttribute("aria-pressed", "true");
    await user.click(throwBtn);

    // After both discard the pone cuts; if that's us, we press the button.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Cut the deck" }) ??
          screen.queryAllByText(/The cut is/)[0],
      ).toBeTruthy(),
    );
    const cut = screen.queryByRole("button", { name: "Cut the deck" });
    if (cut) await user.click(cut);
    await waitFor(() => expect(screen.getAllByText(/The cut is/).length).toBeGreaterThan(0));
    await waitFor(() => expect(hand().getAllByRole("button").length).toBeLessThanOrEqual(4));
  });

  it("uses the Spyglass to see the opponent's hand", async () => {
    const user = await startGame("Pirate");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));
    await user.click(screen.getByRole("button", { name: /Spyglass/ }));
    const spied = await screen.findByLabelText("Opponent's hand seen through the spyglass");
    // Six cards, or the four they kept if the bot already discarded.
    expect(within(spied).getAllByRole("img").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/You used Spyglass/).length).toBeGreaterThan(0);
  });

  it("plays a full game to the end", async () => {
    const user = await startGame("Pirate", "Easy");
    for (let i = 0; i < 400; i++) {
      if (screen.queryByRole("dialog", { name: /Victory|Defeat/ })) break;
      const next = screen.queryByRole("button", { name: "Next round" });
      const ready = screen.queryByRole("button", { name: /Set sail/ });
      const cut = screen.queryByRole("button", { name: "Cut the deck" });
      const throwBtn = screen.queryByRole("button", { name: "Throw to crib" });
      const cards = screen.queryByLabelText("Your hand")
        ? hand()
            .queryAllByRole("button")
            .filter((b) => !b.hasAttribute("disabled"))
        : [];
      if (next) await user.click(next);
      else if (cut) await user.click(cut);
      else if (ready) await user.click(ready);
      else if (throwBtn && cards.length >= 2) {
        if (throwBtn.hasAttribute("disabled")) {
          await user.click(cards[0]!);
          await user.click(cards[1]!);
        }
        await user.click(throwBtn);
      } else if (cards[0]) await user.click(cards[0]);
      else await new Promise((r) => setTimeout(r, 30));
    }
    const end = screen.getByRole("dialog", { name: /Victory|Defeat/ });
    expect(within(end).getByText(/121/)).toBeInTheDocument();
  }, 60_000);

  it("cuts for the deal before the first hand", async () => {
    const user = userEvent.setup();
    render(<App botDelay={0} />);
    await user.click(screen.getByRole("button", { name: /set sail/i }));
    expect(screen.getByRole("heading", { name: "Cut for the deal" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Cut card/ }).length).toBeGreaterThanOrEqual(51);
    await cutForDeal(user);
    expect(screen.getAllByText(/cut low and deals? first/).length).toBeGreaterThan(0);
  });

  it("offers to resume a saved game", async () => {
    const user = await startGame("Classic");
    await waitFor(() => expect(hand().getAllByRole("button")).toHaveLength(6));
    await user.click(screen.getByRole("button", { name: /Harbour/ }));
    await user.click(screen.getByRole("button", { name: /Resume/ }));
    expect(hand().getAllByRole("button")).toHaveLength(6);
  });
});
