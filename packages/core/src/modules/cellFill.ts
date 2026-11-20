import { makeNoise2D } from "../prng/noise.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { defineModule } from "./types.ts";

const FALLBACK = ["#111111", "#777777", "#eeeeee"] as const;

export const cellFillModule = defineModule({
  id: "cellFill",
  label: "Cell fill",
  description: "Fills grid cells with palette colors.",
  params: {
    fillChance: { kind: "number", group: "Fill", label: "Fill chance", min: 0, max: 1, step: 0.01, default: 0.85 },
    source: { kind: "enum", group: "Fill", label: "Color source", options: ["zone", "palette", "noise"], default: "zone" },
    shape: { kind: "enum", group: "Fill", label: "Shape", options: ["square", "rounded", "circle"], default: "square" },
    roundness: { kind: "number", group: "Fill", label: "Roundness", min: 0, max: 0.5, step: 0.01, default: 0.2 },
    inset: { kind: "number", group: "Fill", label: "Inset", min: 0, max: 0.4, step: 0.01, default: 0 },
    outline: { kind: "bool", group: "Outline", label: "Outline", default: false },
    outlineColor: { kind: "color", group: "Outline", label: "Outline color", default: "#0d1b2a" },
    outlineWidth: { kind: "number", group: "Outline", label: "Outline width", min: 0.0005, max: 0.01, step: 0.0005, default: 0.002 },
  },
  apply(scene, v, ctx) {
    const pal = scene.palette;
    const fillRng = ctx.rng("fill");
    const colorRng = ctx.rng("color");
    const noise = makeNoise2D(ctx.rng("noise"));

    const colorFor = (cx: number, cy: number): string => {
      // Exactly one draw per cell regardless of source keeps streams aligned.
      const r = colorRng();
      const choose = (xs: readonly string[]): string => xs[Math.floor(r * xs.length)] ?? FALLBACK[0];
      if (!pal) return choose(FALLBACK);
      switch (v.source) {
        case "zone":
          return choose(pal.zoneColors[pal.zoneAt(cx, cy)] ?? pal.colors);
        case "palette":
          return choose(pal.colors);
        case "noise": {
          const t = Math.min(0.999, Math.max(0, (noise(cx * 3, cy * 3) - 0.2) / 0.6));
          return pal.colors[Math.floor(t * pal.colors.length)] ?? choose(pal.colors);
        }
      }
    };

    const stroke = v.outline ? { stroke: v.outlineColor, strokeWidth: v.outlineWidth } : {};
    const items: Item[] = scene.cells.flatMap((c): Item[] => {
      const filled = fillRng() < v.fillChance;
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const color = colorFor(cx, cy);
      if (!filled) return [];
      const iw = c.w * (1 - v.inset);
      const ih = c.h * (1 - v.inset);
      if (v.shape === "circle") {
        return [{ type: "circle", cx, cy, r: Math.min(iw, ih) / 2, fill: color, ...stroke }];
      }
      const r = v.shape === "rounded" ? Math.min(iw, ih) * v.roundness : 0;
      return [{ type: "rect", x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih, r, fill: color, ...stroke }];
    });

    return addItems(scene, items);
  },
});

