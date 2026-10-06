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

describe("support FAQ", () => {
  it("groups fifteen questions under Playing, Online and your account, and Help", async () => {
    stubEmail(true);
    render(<SupportScreen />);
    const faq = screen.getByRole("region", { name: "Common questions" });
    const groups = ["Playing", "Online and your account", "Help"];
    for (const group of groups)
      expect(screen.getByRole("heading", { level: 3, name: group })).toBeInTheDocument();
    const counts = groups.map(
      (group) => screen.getByRole("region", { name: group }).querySelectorAll("details").length,
    );
    expect(counts).toEqual([8, 6, 1]);
    expect(faq.querySelectorAll("details")).toHaveLength(15);
    // Answers with lists sit in a <div>, never a list inside a <p>.
    expect(faq.querySelector("p ul")).toBeNull();
    expect(faq.querySelectorAll("details ul")).toHaveLength(2);
    await screen.findByRole("link", { name: "Forgot your password?" });
  });

  it("links to real pages and to the form for bug reports", () => {
    stubEmail(true);
    render(<SupportScreen />);
    const hrefs = [...document.querySelectorAll("details a")].map((a) => a.getAttribute("href"));
    for (const href of ["/account", "/privacy", "/cribbage/daily", "/login", "/signup"])
      expect(hrefs).toContain(href);
    expect(screen.getByRole("link", { name: "form below" })).toHaveAttribute("href", "#contact");
    expect(document.getElementById("contact")).toHaveAccessibleName("Contact us");
    // The delete button's real label.
    expect(screen.getByText("Delete my account")).toBeInTheDocument();
  });
});
