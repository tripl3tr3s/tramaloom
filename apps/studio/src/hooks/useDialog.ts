import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The element focused most recently. A dialog that loads lazily renders after the app behind
// it went inert, which already moved focus to <body>; this still knows what opened it.
let lastFocused: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    if (e.target instanceof HTMLElement) lastFocused = e.target;
  });
}

/** What had focus when the dialog opened: the active element, or the one inert just took it from. */
function opener(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return lastFocused?.isConnected && lastFocused.closest("[inert]") ? lastFocused : active instanceof HTMLElement ? active : null;
}

/**
 * Modal dialog plumbing: moves focus into the dialog on open, gives it back on
 * close, and routes keys to `onKey` (latest handler, no stale closures).
 */
export function useDialog<T extends HTMLElement>(onKey: (e: KeyboardEvent) => void) {
  const ref = useRef<T | null>(null);
  const handler = useRef(onKey);
  // Read during the first render: by the time effects run, the app behind the dialog
  // is already inert and the browser has moved focus off the opener to <body>.
  const [previous] = useState(opener);
  useLayoutEffect(() => {
    handler.current = onKey;
  });
  useEffect(() => {
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      if (previous?.isConnected) previous.focus();
    };
  }, [previous]);
  return ref;
}

/** Focus is in a text-like control where letter keys belong to the user. */
export const isTypingTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t.matches("input:not([type=range]):not([type=checkbox]), textarea, select"));
