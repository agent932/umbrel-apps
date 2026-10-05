import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SettingsButton } from "./SettingsButton.js";
import { TableMenu } from "./table/TableMenu.js";

/** The rule for a CSS selector in the app's stylesheet. */
function cssRule(selector: string) {
  const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("menus and dialogs stay on screen", () => {
  it("drops the settings into the page itself, held inside both edges of the screen", () => {
    render(
      <div style={{ transform: "translateX(0)" }}>
        <SettingsButton />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const panel = screen.getByRole("dialog", { name: "Settings" });
    // Outside any transformed or scrolling parent, so it can't be clipped or carried off screen.
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveClass("float-panel", "settings-panel");
    expect(panel.style.getPropertyValue("--at-right")).toMatch(/px$/);
    const rule = cssRule(".settings-panel");
    expect(rule).toMatch(/left: clamp\(/);
    expect(rule).toContain("safe-area-inset-left");
    expect(rule).toContain("safe-area-inset-right");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("opens the table menu in the top-left corner as a panel that scrolls", () => {
    render(
      <TableMenu
        round={3}
        pirate
        oppName="Bosun"
        onExit={() => {}}
        onForfeit={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Menu" })).toHaveClass("float-panel", "t-menu-panel");
  });

  it("gives every panel a height limit inside the safe areas, and a scroll", () => {
    const float = cssRule(".float-panel");
    expect(float).toMatch(/max-height: calc\(\s*100dvh/);
    expect(float).toContain("safe-area-inset-bottom");
    expect(float).toContain("overflow-y: auto");
    const shade = cssRule(".dialog-shade");
    for (const side of ["top", "right", "bottom", "left"])
      expect(shade).toContain(`safe-area-inset-${side}`);
    expect(cssRule(".dialog-shade > *")).toContain("overflow-y: auto");
    expect(cssRule(".t-menu-panel")).toContain("safe-area-inset-top");
  });

  it("keeps the landscape board off the screen's left edge, right of the menu button", () => {
    const board = cssRule(".t-board");
    expect(board).toContain("left: var(--bx)");
    expect(cssRule(".table-grid")).toMatch(/--bx: calc\(var\(--edge\) \+ var\(--mw\)/);
  });
});

/** The table menu with its button, the way the game screen wires them. */
function MenuHarness() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={button} type="button" aria-label="Menu" onClick={() => setOpen((o) => !o)} />
      <button type="button">Elsewhere</button>
      {open && (
        <TableMenu
          round={1}
          pirate={false}
          oppName="Bosun"
          onExit={() => {}}
          onClose={() => setOpen(false)}
          opener={button}
        />
      )}
    </>
  );
}

describe("menus close when you're done with them", () => {
  it("closes the table menu on a tap outside it, but not on a tap inside", () => {
    render(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.pointerDown(screen.getByText("Round 1 · Classic"));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });

  it("closes the table menu on Escape and puts focus back on the menu button", () => {
    render(<MenuHarness />);
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    screen.getByRole("button", { name: "Harbour" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(button).toHaveFocus();
  });

  it("toggles shut from its own button without reopening", () => {
    render(<MenuHarness />);
    const button = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(button);
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
  });

  it("closes the settings on a tap outside or Escape, focus back on the wheel", () => {
    render(<SettingsButton />);
    const wheel = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(wheel);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(wheel).toHaveFocus();
    fireEvent.click(wheel);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(wheel).toHaveFocus();
  });
});
