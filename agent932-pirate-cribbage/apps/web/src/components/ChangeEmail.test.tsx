import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangeEmail } from "./ChangeEmail.js";

const refresh = vi.fn(async () => {});
vi.mock("../auth.js", () => ({ useAuth: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

async function fill(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New email"), email);
  await user.type(screen.getByLabelText("Current password"), "parrots-and-rum");
  await user.click(screen.getByRole("button", { name: "Change email" }));
}

describe("Change email", () => {
  it("sends the new email with your password, then shows it and refreshes who you are", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ user: { email: "new@example.test" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<ChangeEmail />);
    await fill("New@Example.test");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Email changed to new@example.test. You've been signed out on your other devices.",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/email",
      expect.objectContaining({
        body: JSON.stringify({ email: "New@Example.test", password: "parrots-and-rum" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("New email")).toHaveValue("");
  });

  it("shows the server's reason when the email is taken", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: "That email is already taken" }), { status: 409 }),
    );
    render(<ChangeEmail />);
    await fill("bosun@example.test");
    expect(await screen.findByRole("alert")).toHaveTextContent("That email is already taken");
    expect(refresh).not.toHaveBeenCalled();
  });
});
