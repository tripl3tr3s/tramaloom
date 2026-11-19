import { makeNoise2D } from "../prng/noise.ts";
import type { Cell, Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
type Motif = "arcs" | "diagonal" | "triangle" | "quarter";
const MIXED: readonly Motif[] = ["arcs", "diagonal", "triangle", "quarter"];
const ARC_STEPS = 16;

// Cell corners in rotation order: top-left, top-right, bottom-right, bottom-left.
const corner = (c: Cell, k: number): Pt => {
  const i = ((k % 4) + 4) % 4;
  return [i === 1 || i === 2 ? c.x + c.w : c.x, i >= 2 ? c.y + c.h : c.y];
};

/**
 * Quarter-ellipse around corner k with radii (rx, ry), sweeping between the two
 * cell edges that meet at that corner. Built from a fixed table of unit points
 * so the geometry needs only + and *.
 */
const UNIT: readonly Pt[] = Array.from({ length: ARC_STEPS + 1 }, (_, s): Pt => {
  // Rational quarter-circle parametrisation: exact arithmetic, no trig.
  const t = s / ARC_STEPS;
  const d = 1 + t * t;
  return [(1 - t * t) / d, (2 * t) / d];
});

function quarterArc(c: Cell, k: number, rx: number, ry: number): Pt[] {
  const [ox, oy] = corner(c, k);
  const i = ((k % 4) + 4) % 4;
  // Direction from the corner into the cell.
  const sx = i === 0 || i === 3 ? 1 : -1;
  const sy = i <= 1 ? 1 : -1;
  return UNIT.map(([u, w]): Pt => [ox + sx * u * rx, oy + sy * w * ry]);
}

const SQRT2 = 1.4142135623730951;

/**
 * Edge crossing fractions for n parallel arcs, plus the stroke width that fits.
 * Symmetric around 0.5 so tiles connect in every rotation. The outermost arcs of
 * opposite corners sit sqrt(2) - 2 * max apart on the diagonal, so max shrinks as
 * lines thicken, and the width is capped so neighbouring strokes never merge.
 */
function arcLayout(n: number, lw: number): { readonly fractions: number[]; readonly width: number } {
  if (n === 1) return { fractions: [0.5], width: lw };
  const max = Math.min(0.68, (SQRT2 - 1.25 * lw) / 2);
  const span = 2 * (max - 0.5);
  const gap = span / (n - 1);
  return {
    fractions: Array.from({ length: n }, (_, k) => 1 - max + gap * k),
    width: Math.min(lw, gap / 1.6),
  };
}

export const tilesModule = defineModule({
  id: "tiles",
  label: "Tiles",
  description:
    "Truchet tiles: arcs, diagonals, triangles and quarter discs, rotated per cell. Arcs join up across equal-size cells with no gap.",
  params: {
    motif: { kind: "enum", label: "Motif", options: ["arcs", "diagonal", "triangle", "quarter", "mixed"], default: "arcs" },
    chance: { kind: "number", label: "Chance", min: 0, max: 1, step: 0.01, default: 1 },
    lines: { kind: "int", label: "Lines", min: 1, max: 5, default: 1, help: "Parallel arcs per corner" },
    lineWidth: { kind: "number", label: "Line width", min: 0.02, max: 0.3, step: 0.005, default: 0.08 },
    rotation: {
      kind: "enum",
      label: "Rotation",
      options: ["random", "noise", "checker"],
      default: "random",
      help: "noise: neighbouring cells tend to agree; checker: fixed pattern by grid position",
    },
    noiseScale: { kind: "number", label: "Noise scale", min: 0.5, max: 10, step: 0.1, default: 3, help: "Features per canvas width" },
    colorRule: { kind: "enum", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    // Exactly four draws per cell (chance, rotation, color, motif).
    const rng = ctx.rng("cell");
    const under = colorLookup(scene);
    const noise = makeNoise2D(ctx.rng("noise"));
    const L = scene.lattice;
    // Integer grid position of a cell at its own subdivision level. Uses the lattice
    // pitch (not the gapped cell size) and floors a cell center, which sits half a
    // step from any boundary, so float error cannot flip it.
    const gridPos = (c: Cell, cx: number, cy: number): readonly [number, number] => {
      if (!L) return [Math.floor((cx - scene.frame.x) / c.w), Math.floor((cy - scene.frame.y) / c.h)];
      const k = 1 << c.depth;
      return [Math.floor((cx - L.x) / (L.cw / k)), Math.floor((cy - L.y) / (L.ch / k))];
    };

    const items: Item[] = scene.cells.flatMap((c): Item[] => {
      const hit = rng() < v.chance;
      const uRot = rng();
      const uColor = rng();
      const uMotif = rng();
      if (!hit || c.w <= 0 || c.h <= 0) return [];

      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const motif: Motif = v.motif === "mixed" ? (MIXED[Math.floor(uMotif * MIXED.length)] ?? "arcs") : v.motif;
      const rot = ((): number => {
        switch (v.rotation) {
          case "random":
            return Math.floor(uRot * 4);
          case "noise": {
            const t = Math.min(0.999, Math.max(0, (noise(cx * v.noiseScale, cy * v.noiseScale) - 0.2) / 0.6));
            return Math.floor(t * 4);
          }
          case "checker": {
            const [ix, iy] = gridPos(c, cx, cy);
            const px = ix & 1;
            const py = iy & 1;
            // Two-way motifs alternate like a checkerboard; four-way ones turn around each 2x2 block.
            return motif === "arcs" || motif === "diagonal" ? (px + py) & 1 : [0, 1, 3, 2][px + 2 * py] ?? 0;
          }
        }
      })();
      const color = pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under);
      const stroke = { stroke: color, strokeWidth: v.lineWidth * Math.min(c.w, c.h) };

      switch (motif) {
        case "arcs": {
          // Arcs around two opposite corners; rotation parity picks which pair.
          const k = rot % 2;
          const { fractions, width } = arcLayout(v.lines, v.lineWidth);
          const arc = { stroke: color, strokeWidth: width * Math.min(c.w, c.h) };
          return fractions.flatMap((f): Item[] => [
            { type: "polyline", points: quarterArc(c, k, f * c.w, f * c.h), ...arc },
            { type: "polyline", points: quarterArc(c, k + 2, (1 - f) * c.w, (1 - f) * c.h), ...arc },
          ]);
        }
        case "diagonal":
          return [{ type: "polyline", points: [corner(c, rot % 2), corner(c, (rot % 2) + 2)], ...stroke }];
        case "triangle":
          return [{ type: "polyline", closed: true, points: [corner(c, rot), corner(c, rot + 1), corner(c, rot + 3)], fill: color }];
        case "quarter":
          return [{ type: "polyline", closed: true, points: [corner(c, rot), ...quarterArc(c, rot, c.w, c.h)], fill: color }];
      }
    });
    return addItems(scene, items);
  },
});
