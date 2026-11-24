import type { Distribution } from "@tramaloom/core";

/** Keys that move a range input; the first press of a run opens an undo checkpoint. */
export const SLIDER_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

const decimals = (step: number): number => {
  const s = String(step);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
};

/** Clamps to [min, max] and snaps to the step grid that starts at min, without float dust (0.30000000000000004). */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  if (!(step > 0)) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(Math.max(decimals(step), decimals(min))))));
}

/** The value at a fraction (0 to 1) of a track, snapped. */
export function valueAt(fraction: number, min: number, max: number, step: number): number {
  return snapToStep(min + Math.min(1, Math.max(0, fraction)) * (max - min), min, max, step);
}

/**
 * Where a slider key moves a value, as a native range input would: arrows one step,
 * Page keys ten, Home and End to the ends. null for keys a slider does not handle.
 */
export function keyStep(key: string, value: number, min: number, max: number, step: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return snapToStep(value + step, min, max, step);
    case "ArrowLeft":
    case "ArrowDown":
      return snapToStep(value - step, min, max, step);
    case "PageUp":
      return snapToStep(value + step * 10, min, max, step);
    case "PageDown":
      return snapToStep(value - step * 10, min, max, step);
    case "Home":
      return min;
    case "End":
      return max;
    default:
      return null;
  }
}

/** Matches core's gaussian: 0.5 + N(0, 1) * 0.18, clamped to the range. */
const GAUSS_SD = 0.18;

/**
 * Relative probability density of a variation across its range, sampled at
 * `n` cell midpoints and scaled so the peak is 1. Drawing aid only: it mirrors
 * the shapes in core's `unit()` (low is u*u, high its mirror) and never feeds
 * back into rendering.
 */
export function densityCurve(dist: Distribution, n: number): readonly number[] {
  const ts = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  const raw = ((): readonly number[] => {
    switch (dist) {
      case "uniform":
        return ts.map(() => 1);
      case "low":
        return ts.map((t) => 1 / (2 * Math.sqrt(t)));
      case "high":
        // Exact mirror of "low", so both draw identically.
        return [...densityCurve("low", n)].reverse();
      case "gaussian":
        return ts.map((t) => Math.exp(-0.5 * ((t - 0.5) / GAUSS_SD) ** 2));
    }
  })();
  const peak = Math.max(...raw);
  return raw.map((y) => y / peak);
}
