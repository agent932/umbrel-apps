import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { GameEvent } from "@pirate/engine";
import { updateSettings } from "../settings.js";
import { Cinematics, SCENE_MS } from "./Cinematics.js";

const kraken: GameEvent[] = [{ type: "kraken", seat: 1, points: 4, hole: 30 }];

describe("Cinematics", () => {
  afterEach(() => (vi.useRealTimers(), updateSettings({ animations: true })));

  it("plays the painted clip, then gets out of the way", () => {
    vi.useFakeTimers();
    const { container } = render(<Cinematics events={kraken} names={["You", "Bosun"]} me={0} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    const video = container.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect([...video.querySelectorAll("source")].map((s) => s.getAttribute("src"))).toEqual([
      "/cinematics/sinking.webm",
      "/cinematics/sinking.mp4",
    ]);
    act(() => vi.advanceTimersByTime(SCENE_MS));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a still frame of the scene when animations are off", () => {
    updateSettings({ animations: false });
    const { container } = render(<Cinematics events={kraken} names={["You", "Bosun"]} me={0} />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src")).toBe(
      "/cinematics/sinking-still.jpg",
    );
  });
});
