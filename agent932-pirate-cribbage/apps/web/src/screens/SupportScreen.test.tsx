import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SupportScreen } from "./SupportScreen.js";

/** A guest; tests flip `shopOpen` as /api/auth/me would. */
const auth = vi.hoisted(() => ({ user: null, shopOpen: false }));
vi.mock("../auth.js", () => ({ useAuth: () => auth }));

afterEach(() => {
  vi.unstubAllGlobals();
  auth.shopOpen = false;
});

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
  it("groups eighteen questions under Playing, Online and your account, and Help", async () => {
    stubEmail(true);
    render(<SupportScreen />);
    const faq = screen.getByRole("region", { name: "Common questions" });
    const groups = ["Playing", "Online and your account", "Help"];
    for (const group of groups)
      expect(screen.getByRole("heading", { level: 3, name: group })).toBeInTheDocument();
    const counts = groups.map(
      (group) => screen.getByRole("region", { name: group }).querySelectorAll("details").length,
    );
    expect(counts).toEqual([9, 8, 1]);
    expect(faq.querySelectorAll("details")).toHaveLength(18);
    // Answers with lists sit in a <div>, never a list inside a <p>.
    expect(faq.querySelector("p ul")).toBeNull();
    expect(faq.querySelectorAll("details ul")).toHaveLength(3);
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

describe("support FAQ: the shop", () => {
  /** The text of the answer under this question. */
  function answer(q: string): string {
    const details = screen.getByText(q, { selector: "summary" }).closest("details");
    return details?.querySelector("div")?.textContent ?? "";
  }

  it("says there's nothing to buy and the shop is on its way while it's closed", () => {
    stubEmail(true);
    render(<SupportScreen />);
    expect(answer("Is it free?")).toContain("with no ads and no purchases. An account");
    const doubloons = answer("What are doubloons, and how do I earn them?");
    expect(doubloons).toContain(
      "turned into money. A shop of new boards and card backs to spend them on is on its way.",
    );
    expect(doubloons).not.toContain("nothing is random");
    expect(screen.queryByRole("link", { name: "Shop" })).toBeNull();
  });

  it("points to the Shop once it's open, with nothing for real money", () => {
    auth.shopOpen = true;
    stubEmail(true);
    render(<SupportScreen />);
    const free = answer("Is it free?");
    expect(free).toContain("with no ads and nothing to buy with real money. An account");
    expect(free).not.toContain("no purchases");
    const doubloons = answer("What are doubloons, and how do I earn them?");
    expect(doubloons).toContain(
      "turned into money. Spend them in the Shop on new boards and card backs. Every price is " +
        "fixed and you see exactly what you get: nothing is random.",
    );
    expect(doubloons).not.toContain("on its way");
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
    // The same questions in the same places: only the wording changes.
    const faq = screen.getByRole("region", { name: "Common questions" });
    expect(faq.querySelectorAll("details")).toHaveLength(18);
    expect(faq.querySelectorAll("details ul")).toHaveLength(3);
  });
});
