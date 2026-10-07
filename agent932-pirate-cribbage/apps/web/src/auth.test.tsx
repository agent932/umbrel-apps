import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth.js";

/** /api/auth/me answers with `body`, or fails as if offline. */
function me(body: object | "offline") {
  vi.stubGlobal("fetch", async () => {
    if (body === "offline") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

function Shop() {
  const { loading, shopOpen, refresh } = useAuth();
  return (
    <>
      <p>{loading ? "Checking…" : shopOpen ? "Shop open" : "Shop closed"}</p>
      <button type="button" onClick={() => void refresh()}>
        Refresh
      </button>
    </>
  );
}

const show = () =>
  render(
    <AuthProvider>
      <Shop />
    </AuthProvider>,
  );

describe("the shop switch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comes from /me, and is read again on refresh", async () => {
    const user = userEvent.setup();
    me({ user: null, shopOpen: true });
    show();
    expect(await screen.findByText("Shop open")).toBeInTheDocument();
    me({ user: null, shopOpen: false });
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Shop closed")).toBeInTheDocument();
  });

  it("stays closed for a server older than the shop, and with no server", async () => {
    for (const body of [{ user: null }, "offline"] as const) {
      me(body);
      const { unmount } = show();
      expect(await screen.findByText("Shop closed")).toBeInTheDocument();
      unmount();
    }
  });
});
