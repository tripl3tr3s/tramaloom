import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor, rampColors } from "./color.ts";
import { sampleField } from "./trace.ts";
import { defineModule } from "./types.ts";

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

    const field = sampleField(f, v.resolution, height);
    const { lo, hi } = field;

    const L = scene.lattice;
    const keep = (x: number, y: number): boolean => {
      if (!v.followMask || !L) return true;
      const c = Math.floor((x - L.x) / L.cw);
      const r = Math.floor((y - L.y) / L.ch);
      return c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.present[r * L.cols + c] === true;
    };

    const colorRng = ctx.rng("color");
    const under = colorLookup(scene);
    const pal = rampColors(scene);
    const items: Item[] = [];
    for (let k = 0; k < v.levels; k++) {
      const u = colorRng(); // one draw per level, used or not
      const level = lo + ((hi - lo) * (k + 0.5)) / v.levels;
      const color =
        v.colorRule === "ramp"
          ? (pal[Math.min(pal.length - 1, Math.floor(((k + 0.5) / v.levels) * pal.length))] ?? v.color)
          : pickColor(scene, v.colorRule, u, [cx, cy], v.color, under);
      for (const points of field.trace(level, keep)) items.push({ type: "polyline", points, stroke: color, strokeWidth: v.lineWidth });
    }
    return addItems(scene, items);
  },
});
