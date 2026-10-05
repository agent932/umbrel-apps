import { type RefObject, useEffect, useRef } from "react";

/**
 * Closes a floating menu when you tap or click outside it, or press Escape, and puts focus back
 * on the button that opened it. Taps on that button are left to its own toggle.
 */
export function useDismiss(
  panel: RefObject<HTMLElement | null>,
  opener: RefObject<HTMLElement | null> | undefined,
  onClose: () => void,
) {
  // The latest onClose, without re-adding the listeners every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (panel.current?.contains(target) || opener?.current?.contains(target));
    function onPointerDown(e: PointerEvent) {
      if (!inside(e.target)) close.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const panelEl = panel.current;
    const openerEl = opener?.current;
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      // Back to the button, unless you've already moved on to something else on the page.
      const active = document.activeElement;
      if (!active || active === document.body || panelEl?.contains(active) || !active.isConnected)
        openerEl?.focus();
    };
  }, [panel, opener]);
}
