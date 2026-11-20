import { dcos, dsin, TAU } from "../math/trig.ts";
import type { Box, Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor, rampColors } from "./color.ts";
import { defineModule } from "./types.ts";

/** Most cells a spiral is allowed, so a fine grid in cell mode stays drawable. */
const MAX_SEEDS = 24000;

/**
 * Sunflower spirals (Vogel's model): seed i sits at angle i times the divergence
 * angle and radius proportional to sqrt(i), which packs evenly. At the golden angle
 * (about 137.5 degrees) the familiar crossing spirals appear; nearby angles break
 * them into arms and rings.
 */
export const phyllotaxisModule = defineModule({
  id: "phyllotaxis",
  label: "Phyllotaxis",
  description: "Sunflower spirals: seeds at the golden angle, one large spiral or one in every cell. Nudge the angle for arms and rings.",
  params: {
    placement: { kind: "enum", group: "Spiral", label: "Placement", options: ["frame", "cells"], default: "frame", help: "cells: a small spiral in every grid cell" },
    seeds: { kind: "int", group: "Spiral", label: "Seeds", min: 10, max: 3000, default: 500, help: "Per spiral" },
    angle: { kind: "number", group: "Spiral", label: "Angle", min: 130, max: 145, step: 0.01, default: 137.51, help: "Divergence in degrees; 137.51 is the golden angle" },
    fill: { kind: "number", group: "Spiral", label: "Fill", min: 0.2, max: 1, step: 0.01, default: 0.9, help: "How much of its region a spiral covers" },
    size: { kind: "number", group: "Seeds", label: "Seed size", min: 0.1, max: 1.2, step: 0.01, default: 0.8, help: "Relative to the spacing between seeds" },
    taper: { kind: "bool", group: "Seeds", label: "Grow outwards", default: true, help: "Small seeds in the middle, larger at the rim" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: [...COLOR_RULES, "ramp"], default: "ramp", help: colorHelp({ ramp: true }) },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const regions: readonly Box[] = v.placement === "cells" && scene.cells.length ? scene.cells : [scene.frame];
    const n = Math.max(1, Math.min(v.seeds, Math.floor(MAX_SEEDS / regions.length)));
    const turn = (v.angle * TAU) / 360;
    const rng = ctx.rng("spiral");
    const under = colorLookup(scene);
    const pal = rampColors(scene);
    const items: Item[] = regions.flatMap((b): Item[] => {
      // Two draws per spiral: a starting rotation and a color.
      const spin = rng() * TAU;
      const uColor = rng();
      if (b.w <= 0 || b.h <= 0) return [];
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const radius = (Math.min(b.w, b.h) / 2) * v.fill;
      const spacing = radius / Math.sqrt(n);
      const one = pickColor(scene, v.colorRule === "ramp" ? "palette" : v.colorRule, uColor, [cx, cy], v.color, under);
      return Array.from({ length: n }, (_, i): Item => {
        const t = Math.sqrt(i + 0.5);
        const a = spin + i * turn;
        const grow = v.taper ? 0.35 + 0.65 * (t / Math.sqrt(n)) : 1;
        const fill = v.colorRule === "ramp" ? (pal[Math.min(pal.length - 1, Math.floor((t / Math.sqrt(n)) * pal.length))] ?? v.color) : one;
        return { type: "circle", cx: cx + spacing * t * dcos(a), cy: cy + spacing * t * dsin(a), r: spacing * v.size * 0.5 * grow, fill };
      });
    });
    return addItems(scene, items);
  },
});
