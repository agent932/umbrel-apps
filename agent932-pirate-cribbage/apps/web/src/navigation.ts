import { flushSync } from "react-dom";
import { isNativeApp } from "./native.js";
import { CRIBBAGE_HOME } from "./routes.js";

/**
 * Native-feeling navigation, for every route change (links, redirects, the back button):
 *  - screens slide like an iOS navigation stack (View Transitions; skipped when unsupported or
 *    with reduced motion),
 *  - each screen's scroll position is remembered for when you come back, and new screens open at
 *    the top,
 *  - in the iPhone app, drag from the left edge to go back (not on the card table).
 *
 * wouter announces navigations as window events ("pushState", "replaceState", "popstate"). We hear
 * them first, hold them back while the browser snapshots the old screen, then pass them on inside
 * the transition so React draws the new screen.
 */

type Direction = "push" | "pop";

/** How deep a path sits in the app: the hub, a game's home, then everything else. */
function depth(path: string) {
  if (path === "/") return 0;
  if (path === CRIBBAGE_HOME) return 1;
  return 2;
}

/** Game tables: a stray edge swipe mustn't leave a hand mid-play. */
const isTable = (path: string) => path === "/play" || path.startsWith("/online/");

/** The element holding the current screen (App.tsx); the painted backdrop sits outside it. */
const screenEl = () => document.getElementById("screen");

const scrollMemory = new Map<string, number>();
/** Our own copy of the history stack (paths), so we know whether "back" stays in the app. */
const stack: string[] = [];
const PASS = Symbol("deckhand.pass");
/** Set while an edge swipe hands over to the back transition: how far the screen was dragged. */
let swipeHandoff: number | null = null;

function prefersMotion() {
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function afterChange(path: string, direction: Direction) {
  window.scrollTo(0, direction === "pop" ? (scrollMemory.get(path) ?? 0) : 0);
}

/** Whether "back" would land on another screen of this app (rather than leave it). */
export function canGoBack() {
  return stack.length > 1;
}

/** Go back like iOS: pop the stack when there's somewhere to pop to, otherwise go to `fallback`. */
export function goBack(fallback: string, navigate: (to: string) => void) {
  if (stack.length > 1 && stack[stack.length - 2] === fallback) history.back();
  else navigate(fallback);
}

export function installNavigation() {
  if (typeof window === "undefined" || stack.length) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  stack.push(location.pathname);
  document.documentElement.classList.toggle("native-app", isNativeApp);
  if (isNativeApp) installEdgeSwipe();

  let shown = location.pathname;

  const onChange = (event: Event) => {
    if ((event as Event & { [PASS]?: boolean })[PASS]) return;
    const to = location.pathname;
    const from = shown;
    if (to === from) return;
    scrollMemory.set(from, window.scrollY);

    let direction: Direction;
    if (event.type === "popstate") {
      const back = stack.length > 1 && stack[stack.length - 2] === to;
      if (back) stack.pop();
      else stack.push(to);
      direction = back ? "pop" : "push";
    } else if (event.type === "replaceState") {
      stack[stack.length - 1] = to;
      direction = depth(to) < depth(from) ? "pop" : "push";
    } else {
      stack.push(to);
      direction = depth(to) < depth(from) ? "pop" : "push";
    }
    shown = to;

    // An edge swipe already moved the screen; the transition carries on from where it was let go.
    const dragged = swipeHandoff;
    swipeHandoff = null;
    const root = document.documentElement;
    const screen = screenEl();
    if (screen) screen.style.transform = "";
    screen?.classList.remove("is-swiping");

    // Safari's own swipe-back already animated this one; just draw the screen it revealed.
    const systemAnimated = (event as PopStateEvent).hasUAVisualTransition === true;
    const animate =
      typeof document.startViewTransition === "function" &&
      prefersMotion() &&
      !systemAnimated &&
      event.type !== "replaceState";
    if (!animate) {
      // Let the router hear it as usual, then fix up scrolling once the new screen is drawn.
      requestAnimationFrame(() => afterChange(to, direction));
      return;
    }

    event.stopImmediatePropagation();
    const replay = new Event(event.type) as Event & { [PASS]?: boolean };
    replay[PASS] = true;
    root.dataset.nav = direction;
    if (dragged !== null) {
      root.style.setProperty("--drag-from", `${dragged}px`);
      root.style.setProperty("--drag-p", String(Math.min(1, dragged / window.innerWidth)));
    }
    const transition = document.startViewTransition(() => {
      flushSync(() => dispatchEvent(replay));
      afterChange(to, direction);
    });
    // A skipped transition (e.g. the page is hidden) still draws the new screen; nothing to report.
    transition.ready.catch(() => {});
    void transition.finished.finally(() => {
      delete root.dataset.nav;
      root.style.removeProperty("--drag-from");
      root.style.removeProperty("--drag-p");
    });
  };

  // Capture phase, registered before the router subscribes, so we always hear it first.
  for (const type of ["pushState", "replaceState", "popstate"]) {
    addEventListener(type, onChange, { capture: true });
  }
}

/**
 * Drag from the left edge to go back, like a native iOS screen: the screen follows your finger;
 * let go past a third of the way (or with a flick) and it slides off, otherwise it springs back.
 */
function installEdgeSwipe() {
  const EDGE = 24;
  let start: { x: number; y: number; t: number } | null = null;
  let engaged = false;
  let dx = 0;

  const reset = () => {
    start = null;
    engaged = false;
    dx = 0;
  };

  addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || t.clientX > EDGE) return;
      if (!canGoBack() || isTable(location.pathname)) return;
      start = { x: t.clientX, y: t.clientY, t: performance.now() };
    },
    { passive: true },
  );

  addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const mx = t.clientX - start.x;
      const my = t.clientY - start.y;
      if (!engaged) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return reset();
        if (mx < 8) return;
        engaged = true;
        screenEl()?.classList.add("is-swiping");
      }
      e.preventDefault();
      dx = Math.max(0, mx);
      const screen = screenEl();
      if (screen) screen.style.transform = `translateX(${dx}px)`;
    },
    { passive: false },
  );

  const end = () => {
    if (!start || !engaged) return reset();
    const screen = screenEl();
    const speed = dx / Math.max(1, performance.now() - start.t);
    if (dx > window.innerWidth / 3 || speed > 0.5) {
      swipeHandoff = dx;
      history.back();
    } else if (screen) {
      // Not far enough: spring back into place.
      screen.classList.remove("is-swiping");
      screen.classList.add("is-settling");
      screen.style.transform = "";
      setTimeout(() => screen.classList.remove("is-settling"), 260);
    }
    reset();
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", end, { passive: true });
}
