import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TutorialTips } from "./TutorialTips.js";

describe("TutorialTips", () => {
  it("explains each part of the game once, in order, until dismissed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TutorialTips phase="discard" />);
    expect(screen.getByText("Feed the crib")).toBeInTheDocument();
    // The bot cuts and play starts before the player has read the first tip.
    rerender(<TutorialTips phase="cut" />);
    rerender(<TutorialTips phase="pegging" />);
    expect(screen.getByText("Feed the crib")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.getByText("The cut")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.getByText("Pegging")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByLabelText("Peggy's tip")).toBeNull();
    // Pegging again next round: no repeat.
    rerender(<TutorialTips phase="discard" />);
    rerender(<TutorialTips phase="pegging" />);
    expect(screen.queryByLabelText("Peggy's tip")).toBeNull();
  });
});
