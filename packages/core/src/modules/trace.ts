import type { Box } from "../scene.ts";

export type Pt = readonly [number, number];

// Marching squares: for each corner pattern (TL=8, TR=4, BR=2, BL=1 above the level),
// the cell edges a contour joins (0 top, 1 right, 2 bottom, 3 left). Saddles 5 and 10 are
// resolved by the cell's mean value, so every engine picks the same branch.
const CASES: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[3, 2]],
  2: [[2, 1]],
  3: [[3, 1]],
  4: [[0, 1]],
  6: [[0, 2]],
  7: [[0, 3]],
  8: [[0, 3]],
  9: [[0, 2]],
  11: [[0, 1]],
  12: [[3, 1]],
  13: [[2, 1]],
  14: [[3, 2]],
};

export interface SampledField {
  readonly lo: number;
  readonly hi: number;
  /** Contour lines at `level`, joined into polylines; `keep` drops sample cells by their centre. */
  readonly trace: (level: number, keep: (x: number, y: number) => boolean) => Pt[][];
}

/** Sample `height` on a grid over the frame, `resolution` cells across, for contour tracing. */
export function sampleField(f: Box, resolution: number, height: (x: number, y: number) => number): SampledField {
  const nx = resolution + 1;
  const ny = Math.max(2, Math.round((resolution * f.h) / f.w) + 1);
  const sx = f.w / (nx - 1);
  const sy = f.h / (ny - 1);
  const X = (i: number): number => f.x + i * sx;
  const Y = (j: number): number => f.y + j * sy;
  const val = Array.from({ length: nx * ny }, (_, k) => height(X(k % nx), Y(Math.floor(k / nx))));
  const at = (i: number, j: number): number => val[j * nx + i] ?? 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of val) {
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }

  // Edge ids: horizontal edge (i,j)-(i+1,j) is j*nx+i; vertical (i,j)-(i,j+1) is H+j*nx+i.
  const H = nx * ny;
  const cellEdge = (i: number, j: number, side: number): number =>
    side === 0 ? j * nx + i : side === 2 ? (j + 1) * nx + i : side === 3 ? H + j * nx + i : H + j * nx + i + 1;

  const trace = (level: number, keep: (x: number, y: number) => boolean): Pt[][] => {
    // Crossing point on an edge, always interpolated from its lower-index end so neighbours agree exactly.
    const point = (e: number): Pt => {
      const vertical = e >= H;
      const base = vertical ? e - H : e;
      const i = base % nx;
      const j = Math.floor(base / nx);
      const a = at(i, j);
      const b = vertical ? at(i, j + 1) : at(i + 1, j);
      const t = b === a ? 0.5 : (level - a) / (b - a);
      return vertical ? [X(i), Y(j) + t * sy] : [X(i) + t * sx, Y(j)];
    };
    const segs: (readonly [number, number])[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (!keep(X(i) + sx / 2, Y(j) + sy / 2)) continue;
        const tl = at(i, j);
        const tr = at(i + 1, j);
        const br = at(i + 1, j + 1);
        const bl = at(i, j + 1);
        const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
        const centreAbove = (tl + tr + br + bl) / 4 > level;
        const pairs =
          code === 5
            ? centreAbove ? [[0, 3], [2, 1]] : [[0, 1], [3, 2]]
            : code === 10
              ? centreAbove ? [[0, 1], [3, 2]] : [[0, 3], [2, 1]]
              : (CASES[code] ?? []);
        for (const [s0, s1] of pairs) segs.push([cellEdge(i, j, s0 as number), cellEdge(i, j, s1 as number)]);
      }
    }
    // Join segments that share an edge crossing into polylines.
    const byEdge = new Map<number, number[]>();
    segs.forEach(([a, b], s) => {
      byEdge.set(a, [...(byEdge.get(a) ?? []), s]);
      byEdge.set(b, [...(byEdge.get(b) ?? []), s]);
    });
    const used = new Set<number>();
    const walk = (start: number, from: number): number[] => {
      const path: number[] = [];
      let edge = from;
      let seg: number | undefined = start;
      while (seg !== undefined && !used.has(seg)) {
        used.add(seg);
        const s = segs[seg] as readonly [number, number];
        edge = s[0] === edge ? s[1] : s[0];
        path.push(edge);
        seg = (byEdge.get(edge) ?? []).find((x) => !used.has(x));
      }
      return path;
    };
    const paths: Pt[][] = [];
    segs.forEach(([a], s) => {
      if (used.has(s)) return;
      const forward = walk(s, a);
      // Extend backwards from the first edge too, then stitch the two halves.
      const back = (byEdge.get(a) ?? []).find((x) => !used.has(x));
      const backward = back === undefined ? [] : walk(back, a);
      const edges = [...backward.reverse(), a, ...forward];
      if (edges.length >= 2) paths.push(edges.map(point));
    });
    return paths;
  };
  return { lo, hi, trace };
}
