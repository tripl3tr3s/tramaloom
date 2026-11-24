import type { Distribution } from "@tramaloom/core";

/** Keys that move a range input; the first press of a run opens an undo checkpoint. */
export const SLIDER_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

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
