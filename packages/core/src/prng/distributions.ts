import type { Rng } from "./prng.ts";

export const range = (r: Rng, a: number, b: number): number => a + r() * (b - a);
export const int = (r: Rng, a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
export const chance = (r: Rng, p: number): boolean => r() < p;

export function pick<T>(r: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error("pick: empty array");
  return xs[Math.floor(r() * xs.length)] as T;
}

// Only + - * here: `**`, log, cos and friends are implementation-approximated in
// ECMAScript and may differ in the last bit between engines.

/** Bias toward 0. */
export const skewLow = (r: Rng): number => {
  const u = r();
  return u * u;
};
/** Bias toward 1. */
export const skewHigh = (r: Rng): number => {
  const v = 1 - r();
  return 1 - v * v;
};

/**
 * Approximately standard normal (Irwin-Hall: six uniforms, centred and scaled to
 * unit variance). Exact arithmetic, so every engine agrees; tails stop at about
 * 4.2 sigma, which no artwork notices. Consumes six draws.
 */
export function gaussian(r: Rng): number {
  const s = r() + r() + r() + r() + r() + r();
  return (s - 3) * Math.SQRT2;
}

/** Weighted choice over ordered entries. Order is part of the artwork. */
export function weighted<T>(r: Rng, entries: readonly (readonly [T, number])[]): T {
  if (entries.length === 0) throw new Error("weighted: no entries");
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return (entries[0] as readonly [T, number])[0];
  let x = r() * total;
  for (const [v, w] of entries) {
    x -= Math.max(0, w);
    if (x < 0) return v;
  }
  return (entries[entries.length - 1] as readonly [T, number])[0];
}

/** Fisher-Yates on a copy; the input is never mutated. */
export function shuffled<T>(r: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
