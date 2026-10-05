import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportScreen } from "./SupportScreen.js";

vi.mock("../auth.js", () => ({ useAuth: () => ({ user: null }) }));

afterEach(() => vi.unstubAllGlobals());

/** Answers /api/email/enabled with `enabled`; anything else is a plain ok. */
function stubEmail(enabled: boolean) {
  vi.stubGlobal("fetch", async (url: string) =>
    url === "/api/email/enabled"
      ? new Response(JSON.stringify({ enabled }), { status: 200 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
}

describe("support FAQ: I forgot my password", () => {
  it("points to the reset link when the server can send email", async () => {
    stubEmail(true);
    render(<SupportScreen />);
    const link = await screen.findByRole("link", { name: "Forgot your password?" });
    expect(link).toHaveAttribute("href", "/forgot");
  });

  it("says to send a message instead when email is off", async () => {
    stubEmail(false);
    render(<SupportScreen />);
    expect(await screen.findByText(/Send us a message using the form below/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Forgot your password?" })).toBeNull();
  });
});
