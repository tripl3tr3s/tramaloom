import type { Rng } from "./prng.ts";

export const range = (r: Rng, a: number, b: number): number => a + r() * (b - a);
export const int = (r: Rng, a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
export const chance = (r: Rng, p: number): boolean => r() < p;

export function pick<T>(r: Rng, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error("pick: empty array");
  return xs[Math.floor(r() * xs.length)] as T;
}

/** Bias toward 0. */
export const skewLow = (r: Rng): number => r() ** 2;
/** Bias toward 1. */
export const skewHigh = (r: Rng): number => 1 - (1 - r()) ** 2;

/** Standard normal. Consumes two draws. */
export function gaussian(r: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
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
