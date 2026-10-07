import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { GameEvent } from "@pirate/engine";
import { updateSettings } from "../settings.js";
import { dialogProps, useDialog } from "../components/useDialog.js";
import { useLastPlay } from "../components/table/tableHooks.js";
import { Cinematics, SCENE_MS, sceneFor } from "./Cinematics.js";

const kraken: GameEvent[] = [{ type: "kraken", seat: 1, points: 4, hole: 30 }];
const scene = () => screen.queryByRole("dialog");
const carryOn = () => fireEvent.click(screen.getByRole("button", { name: "Carry on" }));

describe("Cinematics", () => {
  afterEach(() => (vi.useRealTimers(), updateSettings({ animations: true })));

  it("plays the painted clip and stays up until you carry on", () => {
    vi.useFakeTimers();
    const { container } = render(<Cinematics events={kraken} names={["You", "Bosun"]} me={0} />);
    expect(scene()).toHaveAccessibleName(/The Kraken drags Bosun back!/);
    const video = container.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect([...video.querySelectorAll("source")].map((s) => s.getAttribute("src"))).toEqual([
      "/cinematics/sinking.webm",
      "/cinematics/sinking.mp4",
    ]);
    act(() => vi.advanceTimersByTime(SCENE_MS * 5));
    expect(scene()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carry on" })).toHaveFocus();
    carryOn();
    expect(scene()).toBeNull();
  });

  it("shows a still frame of the scene when animations are off", () => {
    updateSettings({ animations: false });
    const { container } = render(<Cinematics events={kraken} names={["You", "Bosun"]} me={0} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src")).toBe(
      "/cinematics/sinking-still.jpg",
    );
    expect(screen.getByRole("button", { name: "Carry on" })).toBeInTheDocument();
  });

  it("says who gains or loses points", () => {
    const names: [string, string] = ["You", "Bosun Barnaby"];
    expect(sceneFor([{ type: "treasure", seat: 0, points: 3, hole: 30 }], names, 0)).toMatchObject({
      caption: "You find buried treasure!",
      effect: { text: "+3 points to You", good: true },
    });
    expect(sceneFor([{ type: "kraken", seat: 1, points: -4, hole: 26 }], names, 0)).toMatchObject({
      caption: "The Kraken drags Bosun Barnaby back!",
      effect: { text: "−4 points to Bosun Barnaby", good: false },
    });
  });

  it("waits for the last card of pegging to leave the table before playing", () => {
    vi.useFakeTimers();
    const names: [string, string] = ["You", "Bosun"];
    /** The game screen's wiring: scenes hold while the last cards stay on the table. */
    function Table({ pegging, events }: { pegging: boolean; events: GameEvent[] }) {
      const held = useLastPlay([], 0, pegging, events, false, 2000);
      return (
        <>
          {held && <p>last card</p>}
          <Cinematics events={events} names={names} me={0} hold={!!held} />
        </>
      );
    }
    const { rerender } = render(<Table pegging events={[]} />);
    const lastCard: GameEvent[] = [
      { type: "played", seat: 0, card: { rank: 5, suit: "H" }, count: 31 },
      { type: "treasure", seat: 0, points: 3, hole: 30 },
    ] as GameEvent[];
    rerender(<Table pegging={false} events={lastCard} />);
    expect(screen.getByText("last card")).toBeInTheDocument();
    expect(scene()).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText("last card")).toBeNull();
    expect(scene()).toHaveAccessibleName(/You find buried treasure!/);
    carryOn();
    expect(scene()).toBeNull();
  });

  it("plays scenes that arrive during the hold one after another", () => {
    const names: [string, string] = ["You", "Bosun"];
    const treasure: GameEvent[] = [{ type: "treasure", seat: 0, points: 3, hole: 30 }];
    const { rerender } = render(<Cinematics events={treasure} names={names} me={0} hold />);
    rerender(<Cinematics events={kraken} names={names} me={0} hold />);
    expect(scene()).toBeNull();
    rerender(<Cinematics events={kraken} names={names} me={0} />);
    expect(scene()).toHaveAccessibleName(/treasure/);
    carryOn();
    expect(scene()).toHaveAccessibleName(/Kraken/);
    carryOn();
    expect(scene()).toBeNull();
  });

  it("tells the table to wait while a scene is up or waiting its turn", () => {
    const onActive = vi.fn();
    const names: [string, string] = ["You", "Bosun"];
    const { rerender } = render(
      <Cinematics events={[]} names={names} me={0} hold onActive={onActive} />,
    );
    expect(onActive).toHaveBeenLastCalledWith(false);
    rerender(<Cinematics events={kraken} names={names} me={0} hold onActive={onActive} />);
    expect(onActive).toHaveBeenLastCalledWith(true);
    rerender(<Cinematics events={kraken} names={names} me={0} onActive={onActive} />);
    carryOn();
    expect(onActive).toHaveBeenLastCalledWith(false);
  });

  it("online, stays up until your opponent has carried on too", () => {
    const send = vi.fn();
    const names: [string, string] = ["You", "Bonny"];
    const online = (waits: (0 | 1)[]) => ({ waits, carryOn: send });
    const { rerender } = render(
      <Cinematics events={kraken} names={names} me={0} online={online([0, 1])} />,
    );
    carryOn();
    expect(send).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for Bonny…");
    // The server has your Carry on; Bonny is still watching.
    rerender(<Cinematics events={kraken} names={names} me={0} online={online([1])} />);
    expect(scene()).toBeInTheDocument();
    rerender(<Cinematics events={kraken} names={names} me={0} online={online([])} />);
    expect(scene()).toBeNull();
  });

  it("stays on top of a panel that opens with it, then hands that panel the focus", () => {
    function Result() {
      const panel = useRef<HTMLDivElement>(null);
      useDialog(panel);
      return (
        <div ref={panel} {...dialogProps("Victory!")}>
          <button type="button" autoFocus>
            Play again
          </button>
        </div>
      );
    }
    const skunk: GameEvent[] = [{ type: "gameOver", winner: 0, skunk: 1 }];
    render(
      <>
        <Cinematics events={skunk} names={["You", "Bosun"]} me={0} />
        <Result />
      </>,
    );
    expect(screen.getByRole("button", { name: "Carry on" })).toHaveFocus();
    carryOn();
    expect(screen.getByRole("button", { name: "Play again" })).toHaveFocus();
  });

  it("online, closes at once when your opponent carried on first", () => {
    const names: [string, string] = ["You", "Bonny"];
    render(
      <Cinematics events={kraken} names={names} me={0} online={{ waits: [0], carryOn() {} }} />,
    );
    carryOn();
    expect(scene()).toBeNull();
  });
});
