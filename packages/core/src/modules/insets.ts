import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

export const insetsModule = defineModule({
  id: "insets",
  label: "Insets",
  description: "Nests concentric squares or circles inside grid cells.",
  params: {
    chance: { kind: "number", group: "Placement", label: "Chance", help: "Chance that a cell gets insets", min: 0, max: 1, step: 0.01, default: 0.35 },
    cells: {
      kind: "enum",
      group: "Placement",
      label: "Cells",
      options: ["all", "large", "small"],
      default: "all",
      help: "large: unsplit cells only; small: subdivided cells only (needs grid subdivision)",
    },
    shape: { kind: "enum", group: "Shape", label: "Shape", help: "Shape of the nested insets; mixed picks per cell", options: ["square", "circle", "mixed"], default: "square" },
    style: {
      kind: "enum",
      group: "Shape",
      label: "Style",
      options: ["fill", "stroke"],
      default: "fill",
      help: "fill alternates the picked color with the color underneath",
    },
    rings: { kind: "int", group: "Shape", label: "Rings", help: "How many nested shapes per cell", min: 1, max: 8, default: 3 },
    offset: { kind: "number", group: "Shape", label: "First inset", help: "Distance of the first inset from the cell edge, as a share of the cell", min: 0, max: 0.45, step: 0.01, default: 0.12 },
    spacing: { kind: "number", group: "Shape", label: "Spacing", help: "Distance between nested shapes, as a share of the cell", min: 0.02, max: 0.3, step: 0.01, default: 0.1 },
    roundness: { kind: "number", group: "Shape", label: "Roundness", showIf: { param: "shape", not: ["circle"] }, help: "Corner rounding of square insets", min: 0, max: 0.5, step: 0.01, default: 0 },
    lineWidth: { kind: "number", group: "Shape", label: "Line width", min: 0.01, max: 0.2, step: 0.005, default: 0.04, help: "stroke style" },
    colorRule: { kind: "enum", group: "Color", label: "Color", help: colorHelp(), options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    // Exactly three draws per cell (chance, color, shape) so no setting reshuffles other cells.
    const rng = ctx.rng("cell");
    const under = colorLookup(scene);
    const items: Item[] = scene.cells.flatMap((c): Item[] => {
      const hit = rng() < v.chance;
      const uColor = rng();
      const circle = v.shape === "circle" || (v.shape === "mixed" && rng() < 0.5);
      if (v.shape !== "mixed") rng();
      const eligible = v.cells === "all" || (v.cells === "large" ? c.depth === 0 : c.depth > 0);
      if (!hit || !eligible) return [];

      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const m = Math.min(c.w, c.h);
      const stroke = v.style === "stroke";
      const base = stroke ? "" : under([cx, cy]);
      const first = pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under);
      // Filled rings alternate with the color underneath, so they must differ from it to show.
      const picked = !stroke && first === base ? pickColor(scene, "contrast", uColor, [cx, cy], v.color, under) : first;
      const lw = stroke ? v.lineWidth * m : 0;

      return Array.from({ length: v.rings }, (_, k): Item | null => {
        // Strokes are centred on the outline, so pull them in by half a width to stay inside the cell.
        const off = (v.offset + k * v.spacing) * m + lw / 2;
        const w = c.w - 2 * off;
        const h = c.h - 2 * off;
        if (w <= lw || h <= lw) return null;
        const paint = stroke ? { stroke: picked, strokeWidth: lw } : { fill: k % 2 === 0 ? picked : base };
        if (circle) return { type: "circle", cx, cy, r: Math.min(w, h) / 2, ...paint };
        const r = Math.min(w, h) * v.roundness;
        return { type: "rect", x: cx - w / 2, y: cy - h / 2, w, h, ...(r > 0 ? { r } : {}), ...paint };
      }).filter((it): it is Item => it !== null);
    });
    return addItems(scene, items);
  },
});
