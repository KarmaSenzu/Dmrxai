import { useEffect } from "react";

/**
 * Calls handler when Escape key is pressed.
 * Useful for closing modals/menus.
 */
export function useEscapeKey(handler: (() => void) | null | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || !handler) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handler();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handler, enabled]);
}
