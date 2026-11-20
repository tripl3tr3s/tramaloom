import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];

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

/** Contour lines of a noise landscape, traced across the frame and joined into long paths. */
export const contourModule = defineModule({
  id: "contour",
  label: "Contour",
  description: "Topographic lines of a noise landscape, optionally sheared by fault lines. Long single strokes, so it plots cleanly.",
  params: {
    field: { kind: "enum", group: "Landscape", label: "Landscape", options: ["noise", "ridged", "island"], default: "noise", help: "ridged: sharp crests; island: high in the middle, falling to the edges" },
    noiseScale: { kind: "number", group: "Landscape", label: "Noise scale", min: 0.3, max: 8, step: 0.1, default: 2, help: "Hills per canvas width" },
    octaves: { kind: "int", group: "Landscape", label: "Detail", min: 1, max: 4, default: 2, help: "Layers of finer noise on top" },
    faults: { kind: "int", group: "Landscape", label: "Faults", min: 0, max: 6, default: 0, help: "Straight cracks that shift the land on one side" },
    faultShift: { kind: "number", group: "Landscape", label: "Fault shift", min: 0, max: 0.6, step: 0.01, default: 0.2 },
    levels: { kind: "int", group: "Lines", label: "Levels", min: 2, max: 40, default: 12 },
    resolution: { kind: "int", group: "Lines", label: "Resolution", min: 10, max: 160, default: 70, help: "Samples across the canvas; higher is smoother and slower" },
    lineWidth: { kind: "number", group: "Lines", label: "Line width", min: 0.0005, max: 0.012, step: 0.0005, default: 0.0025 },
    followMask: { kind: "bool", group: "Lines", label: "Stay in mask", default: false, help: "Only draw over cells the grid mask kept" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: [...COLOR_RULES, "ramp"], default: "ramp", help: "ramp: walk the palette from low to high ground" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const f = scene.frame;
    if (f.w <= 0 || f.h <= 0) return scene;
    const noise = makeNoise2D(ctx.rng("noise"));
    const faultRng = ctx.rng("fault");
    // Four draws per fault: a point on it and a direction.
    const faults = Array.from({ length: v.faults }, () => {
      const px = f.x + faultRng() * f.w;
      const py = f.y + faultRng() * f.h;
      return { px, py, dx: faultRng() - 0.5, dy: faultRng() - 0.5 };
    });
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const rr = (f.w * f.w + f.h * f.h) / 4;

    const height = (x: number, y: number): number => {
      let sum = 0;
      let norm = 0;
      let amp = 1;
      let freq = v.noiseScale;
      for (let o = 0; o < v.octaves; o++) {
        sum += amp * noise(x * freq + o * 17.31, y * freq + o * 9.73);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      const n = sum / norm;
      const base = ((): number => {
        switch (v.field) {
          case "noise":
            return n;
          case "ridged":
            return 1 - Math.abs(2 * n - 1);
          case "island": {
            const d = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / rr;
            return n * 0.6 + (1 - d) * 0.6;
          }
        }
      })();
      return faults.reduce((h, q) => h + ((x - q.px) * q.dy - (y - q.py) * q.dx > 0 ? v.faultShift / 2 : -v.faultShift / 2), base);
    };

    const nx = v.resolution + 1;
    const ny = Math.max(2, Math.round((v.resolution * f.h) / f.w) + 1);
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

    const L = scene.lattice;
    const keep = (x: number, y: number): boolean => {
      if (!v.followMask || !L) return true;
      const c = Math.floor((x - L.x) / L.cw);
      const r = Math.floor((y - L.y) / L.ch);
      return c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.present[r * L.cols + c] === true;
    };

    // Edge ids: horizontal edge (i,j)-(i+1,j) is j*nx+i; vertical (i,j)-(i,j+1) is H+j*nx+i.
    const H = nx * ny;
    const cellEdge = (i: number, j: number, side: number): number =>
      side === 0 ? j * nx + i : side === 2 ? (j + 1) * nx + i : side === 3 ? H + j * nx + i : H + j * nx + i + 1;

    const colorRng = ctx.rng("color");
    const under = colorLookup(scene);
    const pal = scene.palette?.colors ?? [];
    const items: Item[] = [];
    for (let k = 0; k < v.levels; k++) {
      const u = colorRng(); // one draw per level, used or not
      const level = lo + ((hi - lo) * (k + 0.5)) / v.levels;
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
      const color =
        v.colorRule === "ramp"
          ? (pal[Math.min(pal.length - 1, Math.floor(((k + 0.5) / v.levels) * pal.length))] ?? v.color)
          : pickColor(scene, v.colorRule, u, [cx, cy], v.color, under);
      segs.forEach(([a], s) => {
        if (used.has(s)) return;
        const forward = walk(s, a);
        // Extend backwards from the first edge too, then stitch the two halves.
        const back = (byEdge.get(a) ?? []).find((x) => !used.has(x));
        const backward = back === undefined ? [] : walk(back, a);
        const edges = [...backward.reverse(), a, ...forward];
        if (edges.length < 2) return;
        items.push({ type: "polyline", points: edges.map(point), stroke: color, strokeWidth: v.lineWidth });
      });
    }
    return addItems(scene, items);
  },
});
