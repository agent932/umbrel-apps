import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How many open modal dialogs hold each table inert (two can be open at once: a power's panel
 * over the show, say). */
const inertHolds = new Map<Element, number>();
/** The open dialogs, newest last: only the newest answers Tab and Escape. */
const openDialogs: HTMLElement[] = [];

function holdInert(el: Element) {
  inertHolds.set(el, (inertHolds.get(el) ?? 0) + 1);
  el.setAttribute("inert", "");
}
function releaseInert(el: Element) {
  const left = (inertHolds.get(el) ?? 1) - 1;
  if (left > 0) return void inertHolds.set(el, left);
  inertHolds.delete(el);
  el.removeAttribute("inert");
}

const focusables = (panel: HTMLElement) =>
  [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest("[inert]"));

export interface DialogOptions {
  /** Escape (and, with `dismissOutside`, a tap outside) calls this. Leave it out for a panel that
   * only closes with its own buttons, like the show. */
  onClose?: () => void;
  /** The button that opened it: focus goes back there, and its own taps are left to its toggle. */
  opener?: RefObject<HTMLElement | null>;
  /** A tap anywhere outside closes it (menus dropped from a button). */
  dismissOutside?: boolean;
  /** Holds focus inside and makes the table behind it inert (true for real dialogs; menus that
   * live inside the table, like the call-outs, pass false). */
  modal?: boolean;
  /** Focus the panel itself rather than its first button (a menu whose first button leaves the game). */
  focusPanel?: boolean;
}

/**
 * Makes a panel behave as a dialog for keyboards and screen readers: focus moves into it when it
 * opens (to whatever has autoFocus, else the first button), Tab stays inside it, Escape closes it,
 * the table behind it can't be reached, and focus goes back to the opener when it closes.
 * The panel itself carries `role="dialog"` and `aria-modal` (see `dialogProps`).
 */
export function useDialog(
  panel: RefObject<HTMLElement | null>,
  { onClose, opener, dismissOutside = false, modal = true, focusPanel = false }: DialogOptions = {},
) {
  // The latest onClose, without re-adding the listeners every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const panelEl = panel.current;
    if (!panelEl) return;
    const openerEl = opener?.current ?? null;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Everything on the table behind it goes quiet (not a table holding the panel itself).
    const behind = modal
      ? [...document.querySelectorAll(".table-grid")].filter((t) => !t.contains(panelEl))
      : [];
    behind.forEach(holdInert);
    openDialogs.push(panelEl);

    // Into the panel, unless something in it already took focus (autoFocus).
    if (!panelEl.contains(document.activeElement)) {
      const first = focusPanel ? null : focusables(panelEl)[0];
      if (first) first.focus();
      else {
        if (!panelEl.hasAttribute("tabindex")) panelEl.setAttribute("tabindex", "-1");
        panelEl.focus();
      }
    }

    const inside = (target: EventTarget | null) =>
      target instanceof Node && (panelEl.contains(target) || !!openerEl?.contains(target));
    function onPointerDown(e: PointerEvent) {
      if (dismissOutside && !inside(e.target)) close.current?.();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (openDialogs.at(-1) !== panelEl) return;
      if (e.key === "Escape" && close.current) {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab" && modal) {
        const all = focusables(panelEl!);
        if (!all.length) return e.preventDefault();
        const first = all[0]!;
        const last = all.at(-1)!;
        const active = document.activeElement;
        // Round the ends, and pull focus back in if it somehow got out.
        if (e.shiftKey && (active === first || !panelEl!.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panelEl!.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      behind.forEach(releaseInert);
      openDialogs.splice(openDialogs.indexOf(panelEl), 1);
      // Back to the button, unless you've already moved on to something else on the page.
      const active = document.activeElement;
      if (!active || active === document.body || panelEl.contains(active) || !active.isConnected) {
        const back = openerEl ?? before;
        if (back?.isConnected) back.focus();
      }
    };
  }, [panel, opener, dismissOutside, modal, focusPanel]);
}

/** The attributes a dialog's panel carries. */
export const dialogProps = (label: string) =>
  ({ role: "dialog", "aria-modal": true, "aria-label": label }) as const;
