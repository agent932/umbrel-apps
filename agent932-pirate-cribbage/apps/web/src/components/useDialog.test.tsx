import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { parseCard, parseCards, scoreHand } from "@pirate/engine";
import { RoundSummary } from "./RoundSummary.js";
import { EmoteButton } from "./table/EmoteButton.js";
import { PowerPanel } from "./table/PowersRail.js";
import { dialogProps, useDialog } from "./useDialog.js";

/** A table with a button that opens a dialog over it, the way the game screen is laid out. */
function Table({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <main>
      <div className="table-grid">
        <div className="t-board" />
        <button ref={opener} type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      {open && (
        <Dialog
          opener={opener}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}

function Dialog(props: { opener: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, props);
  return (
    <div ref={panel} {...dialogProps("Test dialog")}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useDialog", () => {
  it("moves focus in, holds the table inert, closes on Escape and gives focus back", () => {
    const onClose = vi.fn();
    const { container } = render(<Table onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    expect(container.querySelector(".table-grid")).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".table-grid")).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog, round from the last button to the first and back", () => {
    render(<Table />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("lets only the newest of two open dialogs answer Escape (the menu over the show)", () => {
    const under = vi.fn();
    const over = vi.fn();
    const opener = { current: null };
    render(
      <>
        <Dialog opener={opener} onClose={under} />
        <Dialog opener={opener} onClose={over} />
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(over).toHaveBeenCalledOnce();
    expect(under).not.toHaveBeenCalled();
  });
});

describe("the table's dialogs", () => {
  it("opens a power's panel as a modal dialog that Escape closes", () => {
    const onClose = vi.fn();
    render(
      <>
        <div className="table-grid">
          <div className="t-board" />
        </div>
        <PowerPanel
          power="parley"
          used={false}
          usable
          availableNow
          cost={0}
          onUse={() => {}}
          onClose={onClose}
        />
      </>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The use button has autoFocus, and keeps it.
    expect(screen.getByRole("button", { name: /^Use / })).toHaveFocus();
    expect(document.querySelector(".table-grid")).toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("makes the show a modal dialog with focus on the count's Next", () => {
    const show = [
      {
        type: "hand" as const,
        seat: 1 as const,
        cards: parseCards("7H 8D 8C 9S"),
        score: scoreHand(parseCards("7H 8D 8C 9S"), parseCard("KS"), false),
      },
    ];
    render(
      <>
        <div className="table-grid">
          <div className="t-board" />
        </div>
        <RoundSummary show={show} cut={parseCard("KS")} names={["You", "Bosun"]} />
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "The Show" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Next hand" })).toHaveFocus();
    expect(document.querySelector(".table-grid")).toHaveAttribute("inert");
  });

  it("closes the call-outs on Escape, focus back on the button, the table left live", () => {
    render(
      <div className="table-grid">
        <EmoteButton onSend={() => {}} />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Call out" });
    fireEvent.click(button);
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
    // It lives inside the table, so the table can't go inert under it.
    expect(document.querySelector(".table-grid")).not.toHaveAttribute("inert");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
});
