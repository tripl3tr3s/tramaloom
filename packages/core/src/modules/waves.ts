import { dcos, dsin, TAU } from "../math/trig.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor, rampColors } from "./color.ts";
import { sampleField } from "./trace.ts";
import { defineModule } from "./types.ts";

const PI = TAU / 2;

/**
 * Standing and travelling waves drawn as their contour lines. Chladni: the nodal
 * lines of a vibrating square plate, cos(n pi u) cos(m pi v) -/+ cos(m pi u) cos(n pi v).
 * Interference: circular waves from several sources, summed.
 */
export const wavesModule = defineModule({
  id: "waves",
  label: "Waves",
  description: "Chladni plate figures, or rings of interfering waves from several sources, drawn as clean contour lines.",
  params: {
    mode: { kind: "enum", group: "Waves", label: "Kind", options: ["chladni", "interference"], default: "chladni" },
    n: { kind: "int", group: "Chladni", label: "Mode n", min: 1, max: 14, default: 3 },
    m: { kind: "int", group: "Chladni", label: "Mode m", min: 1, max: 14, default: 5 },
    symmetric: { kind: "bool", group: "Chladni", label: "Symmetric", default: false, help: "Add the two modes instead of subtracting" },
    sources: { kind: "int", group: "Interference", label: "Sources", min: 1, max: 8, default: 3 },
    wavelength: { kind: "number", group: "Interference", label: "Wavelength", min: 0.01, max: 0.4, step: 0.005, default: 0.08 },
    lines: { kind: "int", group: "Lines", label: "Lines", min: 1, max: 8, default: 3, help: "1 draws only the nodal lines; more adds lines on both sides of them" },
    resolution: { kind: "int", group: "Lines", label: "Resolution", min: 30, max: 220, default: 140 },
    lineWidth: { kind: "number", group: "Lines", label: "Line width", min: 0.0005, max: 0.012, step: 0.0005, default: 0.002 },
    followMask: { kind: "bool", group: "Lines", label: "Stay in mask", default: false },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: [...COLOR_RULES, "ramp"], default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const f = scene.frame;
    if (f.w <= 0 || f.h <= 0) return scene;
    // Two draws per source, for all of them, whichever mode is on.
    const srcRng = ctx.rng("sources");
    const src = Array.from({ length: v.sources }, () => [f.x + srcRng() * f.w, f.y + srcRng() * f.h] as const);
    // With n = m the antisymmetric plate cancels to zero everywhere: use the symmetric one.
    const sign = v.symmetric || v.n === v.m ? 1 : -1;
    const height = (x: number, y: number): number => {
      if (v.mode === "chladni") {
        const u = (x - f.x) / f.w;
        const w = (y - f.y) / f.h;
        return dcos(v.n * PI * u) * dcos(v.m * PI * w) + sign * dcos(v.m * PI * u) * dcos(v.n * PI * w);
      }
      return src.reduce((s, [sx, sy]) => s + dsin((TAU * Math.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy))) / v.wavelength), 0);
    };
    const field = sampleField(f, v.resolution, height);
    const amp = Math.max(Math.abs(field.lo), Math.abs(field.hi)) * 0.8;
    // The nodal line (level 0) always, plus lines - 1 levels on each side, low to high.
    const levels = Array.from({ length: 2 * v.lines - 1 }, (_, k) => (amp * (k - (v.lines - 1))) / v.lines);

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
    const centre: readonly [number, number] = [f.x + f.w / 2, f.y + f.h / 2];
    const items: Item[] = levels.flatMap((level, k): Item[] => {
      const u = colorRng(); // one draw per level, used or not
      const stroke =
        v.colorRule === "ramp"
          ? (pal[Math.min(pal.length - 1, Math.floor(((k + 0.5) / levels.length) * pal.length))] ?? v.color)
          : pickColor(scene, v.colorRule, u, centre, v.color, under);
      return field.trace(level, keep).map((points): Item => ({ type: "polyline", points, stroke, strokeWidth: v.lineWidth }));
    });
    return addItems(scene, items);
  },
});
