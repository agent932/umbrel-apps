import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App.js";

describe("Deckhand Games hub", () => {
  it("opens on the games list and takes you to Pirate Cribbage", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/");
    render(<App botDelay={0} />);
    expect(screen.getByRole("heading", { name: "Deckhand Games" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Pirate Cribbage/ }));
    expect(window.location.pathname).toBe("/cribbage");
    expect(await screen.findByRole("button", { name: /Set sail/ })).toBeInTheDocument();
  });
});
