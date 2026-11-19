import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Modal dialog plumbing: moves focus into the dialog on open, gives it back on
 * close, and routes keys to `onKey` (latest handler, no stale closures).
 */
export function useDialog<T extends HTMLElement>(onKey: (e: KeyboardEvent) => void) {
  const ref = useRef<T | null>(null);
  const handler = useRef(onKey);
  useLayoutEffect(() => {
    handler.current = onKey;
  });
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return ref;
}

/** Focus is in a text-like control where letter keys belong to the user. */
export const isTypingTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t.matches("input:not([type=range]):not([type=checkbox]), textarea, select"));
