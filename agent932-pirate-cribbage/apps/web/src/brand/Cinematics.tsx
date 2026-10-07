import { useEffect, useRef, useState } from "react";
import { type GameEvent, type PowerId, type Seat, other } from "@pirate/engine";
import { dialogProps, useDialog } from "../components/useDialog.js";
import { useSettings } from "../settings.js";

/** The short pirate scenes, and which game moment plays each one. */
export type Scene =
  | "spyglass"
  | "cannon"
  | "swing"
  | "loot"
  | "trail"
  | "slash"
  | "chest"
  | "sinking"
  | "plank"
  | "island";

const POWER_SCENES: Record<PowerId, Scene> = {
  spyglass: "spyglass",
  crowsNest: "cannon",
  parley: "swing",
  pickpocket: "loot",
  rebury: "trail",
  belay: "slash",
};

/** How long a scene's painted clip (in public/cinematics) plays: 3.4 seconds. */
export const SCENE_MS = 3400;

/** The most dramatic scene for a batch of events (and a caption), or null. */
/** What a scene does to the score: "+3 points to You", in gold for a bonus or red for a penalty. */
export interface SceneEffect {
  text: string;
  good: boolean;
}

export function sceneFor(
  events: GameEvent[],
  names: [string, string],
  me: Seat,
): { scene: Scene; caption: string; effect?: SceneEffect } | null {
  let best: { rank: number; scene: Scene; caption: string; effect?: SceneEffect } | null = null;
  const pick = (rank: number, scene: Scene, caption: string, effect?: SceneEffect) => {
    if (!best || rank > best.rank) best = { rank, scene, caption, effect };
  };
  const who = (s: Seat) => names[s];
  /** "You find" / "Bosun Barnaby finds" (or "spies", given as `theirs`). */
  const does = (s: Seat, verb: string, theirs = `${verb}s`) =>
    s === me ? `You ${verb}` : `${who(s)} ${theirs}`;
  const points = (n: number, s: Seat): SceneEffect => ({
    text: `${n > 0 ? "+" : "−"}${Math.abs(n)} point${Math.abs(n) === 1 ? "" : "s"} to ${s === me ? "You" : who(s)}`,
    good: n > 0,
  });
  for (const e of events) {
    switch (e.type) {
      case "power": {
        const captions: Record<PowerId, string> = {
          spyglass: `${does(e.seat, "spy", "spies")} from the crow's nest!`,
          crowsNest: `${does(e.seat, "fire")} from the crow's nest: the cut is revealed!`,
          parley: `${does(e.seat, "swing")} in for a parley!`,
          pickpocket: `${does(e.seat, "pinch", "pinches")} some loot!`,
          rebury: `${does(e.seat, "rebury", "reburies")} the treasure`,
          belay: `${does(e.seat, "cry")} "Belay that!"`,
        };
        pick(
          2,
          POWER_SCENES[e.power],
          captions[e.power],
          e.cost ? points(-e.cost, e.seat) : undefined,
        );
        break;
      }
      case "treasure":
        pick(3, "chest", `${does(e.seat, "find")} buried treasure!`, points(e.points, e.seat));
        break;
      case "kraken":
        pick(
          3,
          "sinking",
          `The Kraken drags ${e.seat === me ? "you" : who(e.seat)} back!`,
          points(-Math.abs(e.points), e.seat),
        );
        break;
      case "blackSpot": {
        const victim = (e.seat === 0 ? 1 : 0) as Seat;
        pick(
          4,
          "plank",
          `The Black Spot! ${victim === me ? "You walk" : `${who(victim)} walks`} the plank`,
        );
        break;
      }
      case "gameOver":
        if (e.skunk) {
          const loser = (e.winner === 0 ? 1 : 0) as Seat;
          pick(
            5,
            "island",
            loser === me ? "Skunked… marooned on a desert island!" : `${who(loser)} is marooned!`,
          );
        }
        break;
    }
  }
  const found = best as { scene: Scene; caption: string; effect?: SceneEffect } | null;
  return found ? { scene: found.scene, caption: found.caption, effect: found.effect } : null;
}

/* ---------- Characters and props, drawn in a 400×240 scene ---------- */

/** Numbers each scene, so two arriving together can't be mistaken for one. */
let sceneCount = 0;

/**
 * Plays the pirate scene for the latest game events. It stays up until the player taps Carry on,
 * and play waits behind it (`onActive` tells the table). Online, the scene stays until both
 * players have carried on, showing who is still watching.
 * With animations off in Settings, or for people who prefer reduced motion, a still frame shows.
 * While `hold` is on (the last card of pegging is still on the table), scenes wait their turn
 * and play, one after another, once it's lifted.
 */
export function Cinematics({
  events,
  names,
  me,
  hold = false,
  onActive,
  online,
}: {
  events: GameEvent[];
  names: [string, string];
  me: Seat;
  hold?: boolean;
  /** Whether a scene is up or waiting its turn, so the table can pause behind it. */
  onActive?: (active: boolean) => void;
  /** Online: the seats the server is still waiting on, and how to tell it you've carried on. */
  online?: { waits: Seat[]; carryOn: () => void };
}) {
  const { animations } = useSettings();
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const still = !animations || reduceMotion;
  useEffect(() => prefetchScenes(still), [still]);
  // The scene on screen first, then any waiting behind it.
  const [queue, setQueue] = useState<
    { scene: Scene; caption: string; effect?: SceneEffect; key: number }[]
  >([]);
  // Online: the scene you've carried on from, while your opponent is still watching it.
  const [tapped, setTapped] = useState<number | null>(null);

  useEffect(() => {
    const next = sceneFor(events, names, me);
    if (!next) return;
    const scene = { ...next, key: ++sceneCount };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue((q) => [...q, scene]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);
  const active = queue.length > 0;
  useEffect(() => onActive?.(active), [active, onActive]);

  const playing = hold ? null : (queue[0] ?? null);
  const opponentWatching = !!online?.waits.includes(other(me));
  const waiting = !!playing && tapped === playing.key && opponentWatching;
  // Online: once your opponent has carried on too, the scene you tapped closes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (playing && tapped === playing.key && !opponentWatching) setQueue((q) => q.slice(1));
  }, [playing, tapped, opponentWatching]);

  function carryOn() {
    if (!playing) return;
    if (!online) return setQueue((q) => q.slice(1));
    online.carryOn();
    setTapped(playing.key);
  }

  if (!playing) return null;
  return (
    <ScenePanel
      key={playing.key}
      scene={playing}
      still={still}
      waitingFor={waiting ? names[other(me)] : null}
      onCarryOn={carryOn}
    />
  );
}

/** The scene on screen: a dialog over everything (even a show opening behind it). */
function ScenePanel({
  scene,
  still,
  waitingFor,
  onCarryOn,
}: {
  scene: { scene: Scene; caption: string; effect?: SceneEffect };
  still: boolean;
  /** Online, after you've carried on: who is still watching. */
  waitingFor: string | null;
  onCarryOn: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, { onTop: true });
  // Once you've carried on, the button gives way to "Waiting for…": focus stays in the scene.
  useEffect(() => {
    if (waitingFor) panel.current?.focus();
  }, [waitingFor]);
  return (
    <div
      ref={panel}
      tabIndex={-1}
      className="fixed inset-0 z-40 grid place-items-center bg-night/60 p-4 outline-none backdrop-blur-[2px]"
      {...dialogProps(scene.effect ? `${scene.caption} ${scene.effect.text}` : scene.caption)}
      style={{ animation: "cin-fade 300ms ease-out both" }}
    >
      <div className="flex w-full max-w-lg flex-col items-center gap-2">
        <SceneMedia scene={scene.scene} still={still} />
        <p className="text-center font-pirate text-3xl text-gold lantern-glow sm:text-4xl">
          {scene.caption}
        </p>
        {scene.effect && (
          <p
            className={`rounded-full px-4 py-1 text-lg font-extrabold ${scene.effect.good ? "bg-gold/25 text-gold" : "bg-red-900/60 text-red-200"}`}
          >
            {scene.effect.text}
          </p>
        )}
        {waitingFor ? (
          <p role="status" className="min-h-11 rounded-full bg-night/85 px-5 py-2 text-parchment">
            Waiting for {waitingFor}…
          </p>
        ) : (
          <button type="button" className="btn-primary min-w-40" autoFocus onClick={onCarryOn}>
            Carry on
          </button>
        )}
      </div>
    </div>
  );
}

const prefetched = new Set<string>();

/**
 * Quietly downloads the scenes once the game is on screen, so a clip plays the moment it's
 * needed instead of loading first. Only the stills when motion is off.
 */
function prefetchScenes(still: boolean) {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;
  const ext = still
    ? "-still.jpg"
    : document.createElement("video").canPlayType('video/webm; codecs="vp9"')
      ? ".webm"
      : ".mp4";
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => {
    for (const scene of ALL_SCENES) {
      const url = `/cinematics/${scene}${ext}`;
      if (prefetched.has(url)) continue;
      prefetched.add(url);
      void fetch(url, { priority: "low" } as RequestInit).catch(() => prefetched.delete(url));
    }
  });
}

/**
 * A scene's painted clip, or a still frame of it when motion is off or the clip can't play.
 * Clips are silent, so they autoplay everywhere, including iPhones.
 */
function SceneMedia({ scene, still = false }: { scene: Scene; still?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = `/cinematics/${scene}`;
  const className =
    "aspect-video w-full rounded-2xl border border-gold/40 object-cover shadow-[0_18px_40px_rgba(0,0,0,0.6)]";
  // The still is the clip's big moment (the blast, the X); the poster is its first frame.
  if (still || failed)
    return <img className={className} src={`${src}-still.jpg`} alt="" aria-hidden />;
  return (
    <video
      className={className}
      poster={`${src}.jpg`}
      autoPlay
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      aria-hidden
      onError={() => setFailed(true)}
    >
      <source src={`${src}.webm`} type="video/webm" />
      <source src={`${src}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
    </video>
  );
}

/** Every scene, for the development animation lab. */
export const ALL_SCENES: Scene[] = [
  "spyglass",
  "cannon",
  "swing",
  "loot",
  "trail",
  "slash",
  "chest",
  "sinking",
  "plank",
  "island",
];

export function SceneOnce({ scene, caption }: { scene: Scene; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-2" key={scene + caption}>
      <div className="w-full max-w-lg">
        <SceneMedia scene={scene} />
      </div>
      <p className="text-center font-pirate text-3xl text-gold">{caption}</p>
    </div>
  );
}
