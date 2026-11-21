import { dcos, dsin, TAU } from "../math/trig.ts";
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
    fillChance: { kind: "number", group: "Fill", label: "Fill chance", help: "Chance that each cell is filled", min: 0, max: 1, step: 0.01, default: 0.85 },
    source: { kind: "enum", group: "Fill", label: "Color source", help: "zone: the colors of the cell's region; palette: any color; noise: a smooth color field", options: ["zone", "palette", "noise"], default: "zone" },
    shape: {
      kind: "enum",
      group: "Fill",
      label: "Shape",
      help: "Shape drawn in each cell; triangle, hexagon and star point up",
      options: ["square", "rounded", "circle", "triangle", "hexagon", "star"],
      default: "square",
    },
    roundness: { kind: "number", group: "Fill", label: "Roundness", showIf: { param: "shape", is: ["rounded"] }, help: "Corner rounding of rounded squares", min: 0, max: 0.5, step: 0.01, default: 0.2 },
    inset: { kind: "number", group: "Fill", label: "Inset", help: "Shrinks each shape inside its cell, as a share of the cell", min: 0, max: 0.4, step: 0.01, default: 0 },
    outline: { kind: "bool", group: "Outline", label: "Outline", help: "Draws an outline around every shape", default: false },
    outlineColor: { kind: "color", group: "Outline", label: "Outline color", showIf: { param: "outline", is: [true] }, help: "Color of the outlines", default: "#0d1b2a" },
    outlineWidth: { kind: "number", group: "Outline", label: "Outline width", showIf: { param: "outline", is: [true] }, help: "Outline thickness, as a share of the short side", min: 0.0005, max: 0.01, step: 0.0005, default: 0.002 },
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
      if (v.shape === "triangle" || v.shape === "hexagon" || v.shape === "star") {
        // Regular shapes keep their proportions: they fit a square of the cell's short side.
        const m = Math.min(iw, ih);
        const corners = v.shape === "triangle" ? polygon(cx, cy, m, m, 3) : v.shape === "hexagon" ? polygon(cx, cy, m, m, 6) : polygon(cx, cy, m, m, 5, 0.45);
        return [{ type: "polyline", points: corners, closed: true, fill: color, ...stroke }];
      }
      const r = v.shape === "rounded" ? Math.min(iw, ih) * v.roundness : 0;
      return [{ type: "rect", x: cx - iw / 2, y: cy - ih / 2, w: iw, h: ih, r, fill: color, ...stroke }];
    });

    return addItems(scene, items);
  },
});

type Pt = readonly [number, number];

/**
 * Corners of a pointing-up polygon that fits a box of w by h around (cx, cy): `points` corners,
 * or a star when `inner` (the inner radius as a share of the outer) is given.
 */
function polygon(cx: number, cy: number, w: number, h: number, points: number, inner?: number): Pt[] {
  const n = inner === undefined ? points : points * 2;
  const unit = Array.from({ length: n }, (_, k): Pt => {
    const a = -TAU / 4 + (TAU * k) / n;
    const r = inner !== undefined && k % 2 === 1 ? inner : 1;
    return [dcos(a) * r, dsin(a) * r];
  });
  // Scale and centre by the corners' own extent, so every shape fills its box the same way.
  const xs = unit.map((p) => p[0]);
  const ys = unit.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  const ox = cx - ((x0 + x1) / 2) * k;
  const oy = cy - ((y0 + y1) / 2) * k;
  return unit.map(([x, y]): Pt => [ox + x * k, oy + y * k]);
}
