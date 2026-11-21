import { dcos, dsin, TAU } from "../math/trig.ts";
import { makeNoise2D } from "../prng/noise.ts";
import type { Box, Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];

/** Most points in one spiral: long spirals take longer steps rather than growing without bound. */
const MAX_POINTS = 4000;

/**
 * One continuous line spiralling out from a centre, evenly spaced (an Archimedean spiral), with
 * smooth noise pushing it in and out. A single stroke per spiral, so it plots without lifting.
 */
export const spiralModule = defineModule({
  id: "spiral",
  label: "Spiral",
  description: "One continuous line spiralling out from the centre, pushed in and out by noise. One large spiral, or one per cell.",
  params: {
    placement: { kind: "enum", group: "Spiral", label: "Placement", options: ["frame", "cells"], default: "frame", help: "cells: a small spiral in every grid cell" },
    turns: { kind: "int", group: "Spiral", label: "Turns", help: "How many times the line goes round. Small spirals get fewer, so the line never fills in", min: 1, max: 80, default: 18 },
    size: { kind: "number", group: "Spiral", label: "Size", help: "How much of the frame or cell the spiral fills", min: 0.1, max: 1, step: 0.01, default: 0.9 },
    wobble: { kind: "number", group: "Noise", label: "Wobble", help: "How far the noise pushes the line in and out, up to the gap between turns; at 1 neighbouring turns can touch", min: 0, max: 1, step: 0.01, default: 0.5 },
    noiseScale: { kind: "number", group: "Noise", label: "Noise scale", help: "Waves per canvas width: low is gentle, high is busy", min: 0.5, max: 12, step: 0.1, default: 3 },
    lineWidth: { kind: "number", group: "Line", label: "Line width", help: "Line thickness, as a share of the short side", min: 0.0005, max: 0.02, step: 0.0005, default: 0.003 },
    colorRule: { kind: "enum", group: "Color", label: "Color", help: colorHelp({ per: "spiral" }), options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#111111" },
  },
  apply(scene, v, ctx) {
    // Exactly two draws per spiral (start angle, color), so changing one setting never reshuffles the others.
    const rng = ctx.rng("spiral");
    const noise = makeNoise2D(ctx.rng("noise"));
    const under = colorLookup(scene);
    const s = v.noiseScale;
    const regions: readonly Box[] = v.placement === "cells" && scene.cells.length ? scene.cells : [scene.frame];

    const items: Item[] = regions.flatMap((box): Item[] => {
      const start = rng() * TAU;
      const uColor = rng();
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const R = (Math.min(box.w, box.h) / 2) * v.size;
      if (R <= 0) return [];
      // At least two line widths between turns, so a small spiral stays a line instead of a disc.
      const turns = Math.max(1, Math.min(v.turns, Math.floor(R / (2 * v.lineWidth))));
      const gap = R / turns;
      // Roughly even segments along the line, capped at MAX_POINTS.
      const seg = Math.max(0.002, (Math.PI * R * turns) / MAX_POINTS);
      const end = turns * TAU;
      const points: Pt[] = [];
      for (let th = 0; th <= end; ) {
        const base = (gap * th) / TAU;
        const a = th + start;
        const n = noise((cx + dcos(a) * base) * s, (cy + dsin(a) * base) * s);
        // Noise mostly stays between 0.2 and 0.8: stretch that to -1..1 so Wobble reaches a full gap.
        const push = Math.min(1, Math.max(-1, (n - 0.5) / 0.3));
        const r = Math.max(0, base + push * v.wobble * gap);
        points.push([cx + dcos(a) * r, cy + dsin(a) * r]);
        th += Math.min(0.35, seg / Math.max(base, seg));
      }
      if (points.length < 2) return [];
      return [{ type: "polyline", points, stroke: pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under), strokeWidth: v.lineWidth }];
    });
    return addItems(scene, items);
  },
});
