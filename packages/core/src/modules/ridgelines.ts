import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];

/** Points along each line. */
const SAMPLES = 240;

/**
 * Horizontal lines stacked down the frame, each lifted into peaks by smooth noise, like a
 * mountain range seen from the side. With hidden lines on, every line hides the parts of the
 * lines behind it, worked out as geometry (not by painting over), so a pen plot hides them too.
 */
export const ridgelinesModule = defineModule({
  id: "ridgelines",
  label: "Ridgelines",
  description: "Stacked lines lifted into peaks by noise, seen side-on. Lines in front hide the ones behind, also in a plot.",
  params: {
    lines: { kind: "int", group: "Lines", label: "Lines", help: "How many lines are stacked down the frame", min: 3, max: 200, default: 40 },
    height: { kind: "number", group: "Lines", label: "Height", help: "Tallest peak, measured in gaps between lines", min: 0, max: 12, step: 0.1, default: 5 },
    peaks: { kind: "enum", group: "Lines", label: "Peaks", options: ["centre", "even"], default: "centre", help: "centre: tallest in the middle, flat at the sides; even: anywhere along the line" },
    hidden: { kind: "bool", group: "Lines", label: "Hide what is behind", help: "Each line hides the parts of the lines behind it, also in a pen plot", default: true },
    noiseScale: { kind: "number", group: "Noise", label: "Noise scale", help: "Peaks per canvas width: low is rolling hills, high is jagged", min: 0.5, max: 12, step: 0.1, default: 3 },
    lineWidth: { kind: "number", group: "Line", label: "Line width", help: "Line thickness, as a share of the short side", min: 0.0005, max: 0.02, step: 0.0005, default: 0.003 },
    colorRule: { kind: "enum", group: "Color", label: "Color", help: colorHelp({ per: "line" }), options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#111111" },
  },
  apply(scene, v, ctx) {
    // Exactly one draw per line (its color).
    const rng = ctx.rng("line");
    const noise = makeNoise2D(ctx.rng("noise"));
    const under = colorLookup(scene);
    const f = scene.frame;
    const s = v.noiseScale;
    // Spacing that leaves room for the tallest peak of the first line inside the frame.
    const gap = f.h / (v.lines + v.height);
    const xs = Array.from({ length: SAMPLES }, (_, j) => f.x + (f.w * j) / (SAMPLES - 1));
    const envelope = (x: number): number => {
      if (v.peaks === "even") return 1;
      const t = (2 * (x - f.x)) / f.w - 1;
      const e = 1 - t * t;
      return e * e;
    };

    // Lines from the back (top) to the front (bottom).
    const lines = Array.from({ length: v.lines }, (_, i) => {
      const base = f.y + (v.height + i + 1) * gap;
      const uColor = rng();
      const ys = xs.map((x) => {
        const n = noise(x * s, (base / gap) * 0.37);
        // Low noise stays flat; above it the peak rises along a smooth S-curve, never with a corner.
        const t = Math.min(1, Math.max(0, (n - 0.3) / 0.5));
        return base - v.height * gap * envelope(x) * t * t * (3 - 2 * t);
      });
      return { base, uColor, ys };
    });

    // Front to back: a point shows only where it rises above everything in front of it.
    const horizon = xs.map(() => Number.POSITIVE_INFINITY);
    const runs = lines.map(() => [] as Pt[][]);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      let run: Pt[] = [];
      line.ys.forEach((y, j) => {
        const visible = !v.hidden || y < (horizon[j] ?? Number.POSITIVE_INFINITY);
        if (visible) run.push([xs[j] ?? 0, y]);
        else if (run.length) {
          runs[i]?.push(run);
          run = [];
        }
        if (v.hidden) horizon[j] = Math.min(horizon[j] ?? Number.POSITIVE_INFINITY, y);
      });
      if (run.length) runs[i]?.push(run);
    }

    const items: Item[] = lines.flatMap((line, i): Item[] => {
      const stroke = pickColor(scene, v.colorRule, line.uColor, [f.x + f.w / 2, line.base], v.color, under);
      return (runs[i] ?? []).filter((r) => r.length >= 2).map((points): Item => ({ type: "polyline", points, stroke, strokeWidth: v.lineWidth }));
    });
    return addItems(scene, items);
  },
});
