import { useEffect, useLayoutEffect, useRef } from "react";

export type ShortcutHandlers = Readonly<Record<string, (e: KeyboardEvent) => void>>;

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || t.matches("input, textarea, select"));

/** Keys are e.key values, prefixed "mod+" for Ctrl/Cmd and "shift+" when shifted letters matter. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = `${e.ctrlKey || e.metaKey ? "mod+" : ""}${e.shiftKey ? "shift+" : ""}${key}`;
      const h = ref.current[combo];
      if (h) {
        e.preventDefault();
        h(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
