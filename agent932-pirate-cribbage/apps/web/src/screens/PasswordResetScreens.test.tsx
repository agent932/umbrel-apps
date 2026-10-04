import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotScreen, ResetScreen } from "./PasswordResetScreens.js";

afterEach(() => vi.unstubAllGlobals());

describe("password reset screens", () => {
  it("asks for a link without saying whether the account exists", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    render(<ForgotScreen />);
    await user.type(screen.getByLabelText("Username or email"), "anne");
    await user.click(screen.getByRole("button", { name: "Email me a reset link" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/If that account exists/);
    expect(fetch).toHaveBeenCalledWith("/api/auth/forgot", expect.anything());
  });

  it("checks the two passwords match, then sets the new one", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<ResetScreen token="a-very-long-reset-token-123" />);
    await user.type(screen.getByLabelText("New password"), "new-secret-1");
    await user.type(screen.getByLabelText("New password again"), "different-2");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("don't match");
    await user.clear(screen.getByLabelText("New password again"));
    await user.type(screen.getByLabelText("New password again"), "new-secret-1");
    await user.click(screen.getByRole("button", { name: "Set new password" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/password is changed/);
  });
});
