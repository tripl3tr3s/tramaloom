import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useRef } from "react";

interface Handlers {
  /** A press on the track, at a fraction (0 to 1) of its width. */
  readonly onStart: (fraction: number) => void;
  /** The pointer moved while pressed. */
  readonly onMove: (fraction: number) => void;
  readonly onEnd?: () => void;
}

const fractionOf = (el: HTMLElement, clientX: number): number => {
  const r = el.getBoundingClientRect();
  return r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
};

/**
 * Pointer handling for a slider track drawn with plain elements: mouse, pen and touch
 * alike. The press captures the pointer, so a drag keeps working when the finger leaves
 * the track; pair it with `touch-action: none` on the track so the page does not scroll.
 */
export function useTrackDrag(handlers: Handlers) {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });
  const active = useRef<number | null>(null);

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (active.current !== e.pointerId) return;
    active.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    ref.current.onEnd?.();
  };

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      // A second finger joining a drag is ignored; any other press starts fresh, so a
      // lost pointerup (it happens) can never leave the slider stuck mid-drag.
      if (e.button !== 0 || (active.current !== null && e.pointerType === "touch" && e.currentTarget.hasPointerCapture(active.current))) return;
      // No text selection, no synthetic focus on whatever is under the finger.
      e.preventDefault();
      active.current = e.pointerId;
      e.currentTarget.setPointerCapture(e.pointerId);
      ref.current.onStart(fractionOf(e.currentTarget, e.clientX));
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      if (active.current !== e.pointerId) return;
      ref.current.onMove(fractionOf(e.currentTarget, e.clientX));
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };
}
