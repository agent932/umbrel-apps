import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../auth.js";
import { DailyDiscardScreen, bestStreak } from "./DailyDiscardScreen.js";

/** No server here, so the player is a guest. */
const Screen = () => (
  <AuthProvider>
    <DailyDiscardScreen />
  </AuthProvider>
);

beforeEach(() => localStorage.clear());

describe("daily discard", () => {
  it("counts days in a row with the best throw", () => {
    expect(
      bestStreak({ "2026-10-02": 100, "2026-10-03": 100, "2026-10-04": 100 }, "2026-10-04"),
    ).toBe(3);
    expect(bestStreak({ "2026-10-03": 100, "2026-10-04": 80 }, "2026-10-04")).toBe(0);
  });

  it("lets a guest throw two cards once, then shows how good the throw was", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Screen />);
    const cards = within(await screen.findByLabelText("Today's hand")).getAllByRole("button");
    expect(cards).toHaveLength(6);
    await user.click(cards[0]!);
    await user.click(cards[1]!);
    await user.click(screen.getByRole("button", { name: "Throw to the crib" }));
    expect(screen.getByRole("status")).toHaveTextContent(/out of 100|The best throw/);
    unmount();
    // Coming back the same day shows the result, not a fresh hand.
    render(<Screen />);
    await screen.findByLabelText("Today's hand");
    expect(screen.queryByRole("button", { name: "Throw to the crib" })).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
