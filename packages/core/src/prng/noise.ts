import type { Rng } from "./prng.ts";
import { shuffled } from "./distributions.ts";

/**
 * Seeded 2D value noise in [0, 1]. Uses only +, *, floor: bit-identical
 * across engines (no sin/cos), so it is safe for layout decisions.
 */
export function makeNoise2D(r: Rng): (x: number, y: number) => number {
  const perm = shuffled(
    r,
    Array.from({ length: 256 }, (_, i) => i),
  );
  const values = Array.from({ length: 256 }, () => r());
  const p = (i: number): number => perm[i & 255] as number;
  const lattice = (ix: number, iy: number): number => values[p(ix + p(iy))] as number;
  const fade = (t: number): number => t * t * (3 - 2 * t);

  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };
}
