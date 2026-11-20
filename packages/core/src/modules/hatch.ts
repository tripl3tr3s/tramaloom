import { makeNoise2D } from "../prng/noise.ts";
import type { Cell, Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
type Dir = "horizontal" | "vertical" | "rising" | "falling";
const DIRS: readonly Dir[] = ["horizontal", "rising", "vertical", "falling"];

/**
 * n evenly spaced lines across the unit square (u, v), returned in cell space.
 * Diagonals are u + v = s (rising) and u - v = s (falling), clipped analytically:
 * no trig, so every engine draws the same segments.
 */
function hatchLines(c: Cell, dir: Dir, n: number, inset: number): Pt[][] {
  const ix = c.x + c.w * inset;
  const iy = c.y + c.h * inset;
  const w = c.w * (1 - 2 * inset);
  const h = c.h * (1 - 2 * inset);
  const P = (u: number, v: number): Pt => [ix + u * w, iy + v * h];
  return Array.from({ length: n }, (_, k): Pt[] => {
    const t = (k + 0.5) / n;
    switch (dir) {
      case "horizontal":
        return [P(0, t), P(1, t)];
      case "vertical":
        return [P(t, 0), P(t, 1)];
      case "rising": {
        // In screen space y grows down, so u + v = s runs from bottom-left to top-right.
        const s = 2 * t;
        return s <= 1 ? [P(0, s), P(s, 0)] : [P(s - 1, 1), P(1, s - 1)];
      }
      case "falling": {
        const s = 2 * t - 1;
        return s >= 0 ? [P(s, 0), P(1, 1 - s)] : [P(0, -s), P(1 + s, 1)];
      }
    }
  });
}

/** Parallel line shading per cell. Single strokes only, so it plots as drawn. */
export const hatchModule = defineModule({
  id: "hatch",
  label: "Hatching",
  description: "Parallel lines inside each cell, in four directions. Made of single strokes, so it suits a pen plotter.",
  params: {
    direction: {
      kind: "enum",
      group: "Lines",
      label: "Direction",
      options: ["random", "noise", "horizontal", "vertical", "diagonal", "cross"],
      default: "random",
      help: "noise: neighbouring cells tend to agree; cross: both diagonals",
    },
    chance: { kind: "number", group: "Lines", label: "Chance", help: "Chance that a cell is shaded", min: 0, max: 1, step: 0.01, default: 1 },
    lines: { kind: "int", group: "Lines", label: "Lines", min: 1, max: 24, default: 6, help: "Lines per cell" },
    lineWidth: { kind: "number", group: "Lines", label: "Line width", min: 0.002, max: 0.2, step: 0.002, default: 0.03, help: "Share of the cell size" },
    inset: { kind: "number", group: "Lines", label: "Inset", help: "Margin inside each cell, as a share of the cell", min: 0, max: 0.4, step: 0.01, default: 0.08 },
    noiseScale: { kind: "number", group: "Lines", label: "Noise scale", showIf: { param: "direction", is: ["noise"] }, min: 0.5, max: 10, step: 0.1, default: 3, help: "Features per canvas width" },
    colorRule: { kind: "enum", group: "Color", label: "Color", help: colorHelp(), options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#111111" },
  },
  apply(scene, v, ctx) {
    // Exactly three draws per cell (chance, direction, color).
    const rng = ctx.rng("cell");
    const noise = makeNoise2D(ctx.rng("noise"));
    const under = colorLookup(scene);

    const items: Item[] = scene.cells.flatMap((c): Item[] => {
      const hit = rng() < v.chance;
      const uDir = rng();
      const uColor = rng();
      if (!hit || c.w <= 0 || c.h <= 0) return [];
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const dirs = ((): readonly Dir[] => {
        switch (v.direction) {
          case "random":
            return [DIRS[Math.floor(uDir * 4)] ?? "horizontal"];
          case "noise": {
            const t = Math.min(0.999, Math.max(0, (noise(cx * v.noiseScale, cy * v.noiseScale) - 0.2) / 0.6));
            return [DIRS[Math.floor(t * 4)] ?? "horizontal"];
          }
          case "diagonal":
            return ["rising"];
          case "cross":
            return ["rising", "falling"];
          default:
            return [v.direction];
        }
      })();
      const stroke = pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under);
      const strokeWidth = v.lineWidth * Math.min(c.w, c.h);
      return dirs.flatMap((d) => hatchLines(c, d, v.lines, v.inset).map((points): Item => ({ type: "polyline", points, stroke, strokeWidth })));
    });
    return addItems(scene, items);
  },
});
