import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

/** One dot per cell, sized by a field across the frame: the classic print halftone, on the grid. */
export const halftoneModule = defineModule({
  id: "halftone",
  label: "Halftone",
  description: "A dot or square in every cell, sized by a field: noise, distance from the centre, a gradient or chance.",
  params: {
    field: { kind: "enum", group: "Field", label: "Field", options: ["noise", "radial", "horizontal", "vertical", "random"], default: "noise" },
    noiseScale: { kind: "number", group: "Field", label: "Noise scale", min: 0.5, max: 10, step: 0.1, default: 2.5, help: "Features per canvas width" },
    invert: { kind: "bool", group: "Field", label: "Invert", default: false },
    shape: { kind: "enum", group: "Dots", label: "Shape", options: ["circle", "square", "diamond"], default: "circle" },
    minSize: { kind: "number", group: "Dots", label: "Smallest", min: 0, max: 1, step: 0.01, default: 0.08, help: "Share of the cell" },
    maxSize: { kind: "number", group: "Dots", label: "Largest", min: 0, max: 1.2, step: 0.01, default: 0.92, help: "Share of the cell; above 1 dots overlap" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#111111" },
  },
  apply(scene, v, ctx) {
    // Exactly two draws per cell (field, color).
    const rng = ctx.rng("cell");
    const noise = makeNoise2D(ctx.rng("noise"));
    const under = colorLookup(scene);
    const f = scene.frame;
    const half = Math.sqrt(f.w * f.w + f.h * f.h) / 2;
    const lo = Math.min(v.minSize, v.maxSize);
    const hi = Math.max(v.minSize, v.maxSize);

    const items: Item[] = scene.cells.flatMap((c): Item[] => {
      const uField = rng();
      const uColor = rng();
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const raw = ((): number => {
        switch (v.field) {
          case "noise":
            return (noise(cx * v.noiseScale, cy * v.noiseScale) - 0.2) / 0.6;
          case "radial": {
            const dx = cx - (f.x + f.w / 2);
            const dy = cy - (f.y + f.h / 2);
            return 1 - Math.sqrt(dx * dx + dy * dy) / half;
          }
          case "horizontal":
            return (cx - f.x) / f.w;
          case "vertical":
            return (cy - f.y) / f.h;
          case "random":
            return uField;
        }
      })();
      const t0 = Math.min(1, Math.max(0, raw));
      const t = v.invert ? 1 - t0 : t0;
      const size = (lo + (hi - lo) * t) * Math.min(c.w, c.h);
      if (size <= 0.0005 || c.w <= 0 || c.h <= 0) return [];
      const fill = pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under);
      const r = size / 2;
      switch (v.shape) {
        case "circle":
          return [{ type: "circle", cx, cy, r, fill }];
        case "square":
          return [{ type: "rect", x: cx - r, y: cy - r, w: size, h: size, fill }];
        case "diamond":
          return [{ type: "polyline", closed: true, points: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], fill }];
      }
    });
    return addItems(scene, items);
  },
});
