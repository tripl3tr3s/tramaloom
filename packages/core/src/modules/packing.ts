import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

interface Disc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Circle packing: random spots, each grown to the largest circle that fits between
 * the frame, the circles already placed and a gap. Early spots find room for big
 * circles, later ones fill the cracks, so sizes grade naturally.
 */
export const packingModule = defineModule({
  id: "packing",
  label: "Circle packing",
  description: "Circles that fill the frame without touching, big ones first and small ones in the gaps. Filled, ringed or as concentric ripples.",
  params: {
    attempts: { kind: "int", group: "Packing", label: "Attempts", min: 20, max: 6000, default: 1500, help: "More attempts, a denser fill" },
    maxSize: { kind: "number", group: "Packing", label: "Largest", min: 0.01, max: 0.45, step: 0.005, default: 0.12, help: "Radius, as a share of the short side" },
    minSize: { kind: "number", group: "Packing", label: "Smallest", min: 0.002, max: 0.1, step: 0.001, default: 0.008 },
    gap: { kind: "number", group: "Packing", label: "Gap", min: 0, max: 0.03, step: 0.0005, default: 0.004 },
    followMask: { kind: "bool", group: "Packing", label: "Stay in mask", default: true, help: "Only over cells the grid mask kept" },
    style: { kind: "enum", group: "Look", label: "Style", options: ["fill", "ring", "ripples"], default: "fill", help: "ripples: concentric rings in every circle" },
    rings: { kind: "int", group: "Look", label: "Ripples", min: 2, max: 10, default: 4 },
    lineWidth: { kind: "number", group: "Look", label: "Line width", min: 0.0005, max: 0.012, step: 0.0005, default: 0.0025 },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const f = scene.frame;
    if (f.w <= 0 || f.h <= 0) return scene;
    const L = scene.lattice;
    const lo = Math.min(v.minSize, v.maxSize);
    const hi = Math.max(v.minSize, v.maxSize);
    const inMask = (x: number, y: number): boolean => {
      if (!v.followMask || !L) return true;
      const c = Math.floor((x - L.x) / L.cw);
      const r = Math.floor((y - L.y) / L.ch);
      return c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.present[r * L.cols + c] === true;
    };

    // Buckets one largest-diameter wide: a new circle only has to check its 3x3 block.
    const B = 2 * hi + v.gap;
    const buckets = new Map<string, Disc[]>();
    const key = (x: number, y: number) => `${Math.floor(x / B)},${Math.floor(y / B)}`;
    const discs: Disc[] = [];
    const rng = ctx.rng("spot");
    const colorRng = ctx.rng("color");
    const colors: number[] = [];
    // Three draws per attempt (x, y, color), accepted or not.
    for (let a = 0; a < v.attempts; a++) {
      const x = f.x + rng() * f.w;
      const y = f.y + rng() * f.h;
      const u = colorRng();
      if (!inMask(x, y)) continue;
      let r = Math.min(hi, x - f.x, f.x + f.w - x, y - f.y, f.y + f.h - y);
      const bx = Math.floor(x / B);
      const by = Math.floor(y / B);
      for (let j = by - 1; j <= by + 1 && r >= lo; j++) {
        for (let i = bx - 1; i <= bx + 1 && r >= lo; i++) {
          for (const d of buckets.get(`${i},${j}`) ?? []) {
            const room = Math.sqrt((d.x - x) * (d.x - x) + (d.y - y) * (d.y - y)) - d.r - v.gap;
            if (room < r) r = room;
          }
        }
      }
      if (r < lo) continue;
      // Keep the whole circle over kept cells: test its four extreme points.
      if (!inMask(x + r, y) || !inMask(x - r, y) || !inMask(x, y + r) || !inMask(x, y - r)) continue;
      const disc = { x, y, r };
      discs.push(disc);
      colors.push(u);
      const k = key(x, y);
      buckets.set(k, [...(buckets.get(k) ?? []), disc]);
    }

    const under = colorLookup(scene);
    const items: Item[] = discs.flatMap((d, i): Item[] => {
      const color = pickColor(scene, v.colorRule, colors[i] ?? 0, [d.x, d.y], v.color, under);
      switch (v.style) {
        case "fill":
          return [{ type: "circle", cx: d.x, cy: d.y, r: d.r, fill: color }];
        case "ring":
          return [{ type: "circle", cx: d.x, cy: d.y, r: Math.max(0, d.r - v.lineWidth / 2), stroke: color, strokeWidth: v.lineWidth }];
        case "ripples":
          return Array.from({ length: v.rings }, (_, k): Item => ({
            type: "circle",
            cx: d.x,
            cy: d.y,
            r: Math.max(0, d.r - v.lineWidth / 2) * (1 - k / v.rings),
            stroke: color,
            strokeWidth: v.lineWidth,
          }));
      }
    });
    return addItems(scene, items);
  },
});
