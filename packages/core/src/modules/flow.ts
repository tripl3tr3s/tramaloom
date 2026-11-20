import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];

/**
 * Streamlines through a noise field. Each line walks along the field's contours
 * (perpendicular to its gradient), found by central differences and normalised
 * with sqrt: + * / and sqrt only, so the paths are identical in every engine.
 */
export const flowModule = defineModule({
  id: "flow",
  label: "Flow",
  description: "Streamlines that follow the contours of a noise field, optionally stopping where the grid mask ends.",
  params: {
    count: { kind: "int", group: "Lines", label: "Lines", min: 1, max: 600, default: 140 },
    steps: { kind: "int", group: "Lines", label: "Length", min: 2, max: 400, default: 80, help: "Steps per line" },
    stepLength: { kind: "number", group: "Lines", label: "Step", min: 0.001, max: 0.03, step: 0.0005, default: 0.006 },
    lineWidth: { kind: "number", group: "Lines", label: "Line width", min: 0.0005, max: 0.02, step: 0.0005, default: 0.003 },
    noiseScale: { kind: "number", group: "Field", label: "Noise scale", min: 0.3, max: 8, step: 0.1, default: 2, help: "Swirls per canvas width" },
    followMask: { kind: "bool", group: "Field", label: "Stay in mask", default: true, help: "Stop where the grid mask removed cells" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#111111" },
  },
  apply(scene, v, ctx) {
    // Exactly three draws per line (x, y, color).
    const rng = ctx.rng("seed");
    const noise = makeNoise2D(ctx.rng("noise"));
    const under = colorLookup(scene);
    const f = scene.frame;
    const L = scene.lattice;
    const s = v.noiseScale;
    const eps = 0.01 / s;

    const inside = (x: number, y: number): boolean => {
      if (x < f.x || y < f.y || x > f.x + f.w || y > f.y + f.h) return false;
      if (!v.followMask || !L) return true;
      const c = Math.floor((x - L.x) / L.cw);
      const r = Math.floor((y - L.y) / L.ch);
      return c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.present[r * L.cols + c] === true;
    };
    const direction = (x: number, y: number): Pt | null => {
      const gx = noise((x + eps) * s, y * s) - noise((x - eps) * s, y * s);
      const gy = noise(x * s, (y + eps) * s) - noise(x * s, (y - eps) * s);
      const m = Math.sqrt(gx * gx + gy * gy);
      return m < 1e-9 ? null : [-gy / m, gx / m];
    };

    const items: Item[] = Array.from({ length: v.count }, (): Item[] => {
      const x0 = f.x + rng() * f.w;
      const y0 = f.y + rng() * f.h;
      const uColor = rng();
      if (!inside(x0, y0)) return [];
      const points: Pt[] = [[x0, y0]];
      let x = x0;
      let y = y0;
      for (let k = 0; k < v.steps; k++) {
        const d = direction(x, y);
        if (!d) break;
        const nx = x + d[0] * v.stepLength;
        const ny = y + d[1] * v.stepLength;
        if (!inside(nx, ny)) break;
        x = nx;
        y = ny;
        points.push([x, y]);
      }
      if (points.length < 2) return [];
      return [{ type: "polyline", points, stroke: pickColor(scene, v.colorRule, uColor, [x0, y0], v.color, under), strokeWidth: v.lineWidth }];
    }).flat();
    return addItems(scene, items);
  },
});
