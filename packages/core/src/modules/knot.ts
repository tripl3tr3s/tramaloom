import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
// Directions in counter-clockwise screen order (y grows down): east, north, west, south.
const DIRS: readonly Pt[] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
// How far a strand's control points reach, by how many quarter turns it sweeps around a cell.
const REACH = [0, 0, 0.95, 1.35, 1.7];

const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] =>
  Array.from({ length: steps + 1 }, (_, s): Pt => {
    const t = s / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  });

/** Drop `len` of path from its end, interpolating the last point: the gap where a strand passes under. */
function trimEnd(pts: readonly Pt[], len: number): Pt[] {
  let left = len;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    const d = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    if (d >= left) {
      const t = (d - left) / d;
      return [...pts.slice(0, i), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
    }
    left -= d;
  }
  return pts.slice(0, 1);
}

/**
 * Celtic knotwork on the base grid, by the medial-graph construction: cell centres
 * joined to their neighbours form a graph; strands cross at the midpoint of every
 * link and turn around each cell between consecutive links. Every strand is over at
 * the start of each turn and under at its end, which makes the knot alternate.
 * Removing links ("breaks") turns plain plaitwork into knots.
 */
export const knotModule = defineModule({
  id: "knot",
  label: "Celtic knot",
  description: "Interlaced knotwork woven across the grid, over and under. Breaks turn plain plaitwork into knots. Follows the grid mask.",
  params: {
    breaks: { kind: "number", group: "Knot", label: "Breaks", min: 0, max: 0.7, step: 0.01, default: 0.18, help: "Share of links removed; more breaks, more separate knots" },
    width: { kind: "number", group: "Knot", label: "Strand width", min: 0.06, max: 0.4, step: 0.01, default: 0.22, help: "Share of the cell size" },
    outline: { kind: "bool", group: "Knot", label: "Outline", default: true },
    outlineColor: { kind: "color", group: "Knot", label: "Outline color", default: "#0d1b2a" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast", help: "Picked once per strand" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const L = scene.lattice;
    if (!L || L.cols < 1 || L.rows < 1) return scene;
    const { cols, rows } = L;
    const present = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && L.present[r * cols + c] === true;
    const hx = L.cw / 2;
    const hy = L.ch / 2;

    // Links east and south of every cell: two draws per cell, whether or not they exist.
    const breakRng = ctx.rng("breaks");
    const link = new Set<string>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const east = breakRng() >= v.breaks;
        const south = breakRng() >= v.breaks;
        if (!present(c, r)) continue;
        if (east && present(c + 1, r)) link.add(`${c},${r},0`);
        if (south && present(c, r + 1)) link.add(`${c},${r},3`);
      }
    }
    const linked = (c: number, r: number, d: number): boolean => {
      switch (d) {
        case 0:
          return link.has(`${c},${r},0`);
        case 1:
          return link.has(`${c},${r - 1},3`);
        case 2:
          return link.has(`${c - 1},${r},0`);
        default:
          return link.has(`${c},${r},3`);
      }
    };
    // A link's id is that of its west or north end, so both cells name it alike.
    const linkId = (c: number, r: number, d: number): string =>
      d === 0 ? `${c},${r},0` : d === 1 ? `${c},${r - 1},3` : d === 2 ? `${c - 1},${r},0` : `${c},${r},3`;

    interface Turn {
      readonly pts: Pt[];
      readonly start: string;
      readonly end: string;
    }
    const turns: Turn[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!present(c, r)) continue;
        const ds = [0, 1, 2, 3].filter((d) => linked(c, r, d));
        if (!ds.length) continue;
        const centre: Pt = [L.x + (c + 0.5) * L.cw, L.y + (r + 0.5) * L.ch];
        const at = (d: number, s = 1): Pt => [centre[0] + (DIRS[d] as Pt)[0] * hx * s, centre[1] + (DIRS[d] as Pt)[1] * hy * s];
        ds.forEach((da, k) => {
          const db = ds[(k + 1) % ds.length] as number;
          const sweep = ((db - da + 4) % 4) || 4;
          const p0 = at(da);
          const p3 = at(db);
          let pts: Pt[];
          if (sweep === 1) {
            pts = [p0, p3];
          } else {
            const reach = REACH[sweep] ?? 1;
            const next = DIRS[(da + 1) % 4] as Pt;
            const prev = DIRS[(db + 3) % 4] as Pt;
            const a = DIRS[da] as Pt;
            const b = DIRS[db] as Pt;
            const p1: Pt = [p0[0] + (next[0] - a[0]) * hx * reach, p0[1] + (next[1] - a[1]) * hy * reach];
            const p2: Pt = [p3[0] + (prev[0] - b[0]) * hx * reach, p3[1] + (prev[1] - b[1]) * hy * reach];
            pts = cubic(p0, p1, p2, p3, 10 * sweep);
          }
          turns.push({ pts, start: linkId(c, r, da), end: linkId(c, r, db) });
        });
      }
    }

    // Strands: at each crossing the two turns that end there are one strand (under),
    // and the two that start there are another (over). Union them to colour by strand.
    const parent = turns.map((_, i) => i);
    const find = (i: number): number => {
      let x = i;
      while (parent[x] !== x) x = parent[x] as number;
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    };
    const firstAt = new Map<string, number>();
    turns.forEach((t, i) => {
      for (const key of [`s:${t.start}`, `e:${t.end}`]) {
        const j = firstAt.get(key);
        if (j === undefined) firstAt.set(key, i);
        else union(i, j);
      }
    });
    const colorRng = ctx.rng("color");
    const under = colorLookup(scene);
    const strandColor = new Map<number, string>();
    turns.forEach((t, i) => {
      const root = find(i);
      if (strandColor.has(root)) return;
      const p = t.pts[0] as Pt;
      strandColor.set(root, pickColor(scene, v.colorRule, colorRng(), p, v.color, under));
    });

    const w = v.width * Math.min(L.cw, L.ch);
    // The under strand stops short of the crossing by the over strand's half width, its own
    // round cap and (with outlines) a sliver of outline, so the over strand reads as on top.
    const gap = w * (v.outline ? 1.25 : 1.05);
    const paths = turns.map((t, i) => ({ pts: trimEnd(t.pts, gap), color: strandColor.get(find(i)) ?? v.color })).filter((p) => p.pts.length >= 2);
    // All outlines first, then all strands: a later outline never paints over an earlier strand.
    const outlines: Item[] = v.outline ? paths.map((p): Item => ({ type: "polyline", points: p.pts, stroke: v.outlineColor, strokeWidth: w * 1.45 })) : [];
    const cores: Item[] = paths.map((p): Item => ({ type: "polyline", points: p.pts, stroke: p.color, strokeWidth: w }));
    return addItems(scene, [...outlines, ...cores]);
  },
});
