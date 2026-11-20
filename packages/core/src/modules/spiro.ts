import { dcos, dsin, TAU } from "../math/trig.ts";
import type { Box, Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
const RATIOS: Readonly<Record<string, readonly [number, number]>> = { "1:1": [1, 1], "1:2": [1, 2], "2:3": [2, 3], "3:4": [3, 4], "3:5": [3, 5] };
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Fit points into a box (centred, uniform scale), then rotate by `turn`. */
function fit(pts: readonly Pt[], extent: number, b: Box, fill: number, turn: number): Pt[] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const k = ((Math.min(b.w, b.h) / 2) * fill) / (extent || 1);
  const c = dcos(turn);
  const s = dsin(turn);
  return pts.map(([x, y]): Pt => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)]);
}

/**
 * Drawing-toy curves. Spirograph: the hypotrochoid of a wheel of r teeth rolling in
 * a ring of R, closed after r / gcd(R, r) laps. Harmonograph: two damped pendulums
 * per axis; the damping is applied by repeated multiplication, never Math.exp.
 */
export const spiroModule = defineModule({
  id: "spiro",
  label: "Spirograph",
  description: "Gear-wheel curves that close on themselves, or harmonograph pendulum traces. One large figure or one in every cell.",
  params: {
    mode: { kind: "enum", group: "Figure", label: "Toy", options: ["spirograph", "harmonograph"], default: "spirograph" },
    placement: { kind: "enum", group: "Figure", label: "Placement", options: ["frame", "cells"], default: "frame", help: "cells: a small figure in every grid cell" },
    ring: { kind: "int", group: "Spirograph", label: "Ring teeth", min: 20, max: 150, default: 96 },
    wheel: { kind: "int", group: "Spirograph", label: "Wheel teeth", min: 5, max: 90, default: 52 },
    pen: { kind: "number", group: "Spirograph", label: "Pen hole", min: 0.1, max: 1.5, step: 0.01, default: 0.8, help: "Distance of the pen from the wheel's centre, as a share of its radius" },
    variety: { kind: "number", group: "Spirograph", label: "Variety", min: 0, max: 1, step: 0.01, default: 0.4, help: "cells: how much each cell's wheel differs" },
    ratio: { kind: "enum", group: "Harmonograph", label: "Ratio", options: Object.keys(RATIOS), default: "2:3", help: "Frequency ratio of the two axes" },
    detune: { kind: "number", group: "Harmonograph", label: "Detune", min: 0, max: 0.05, step: 0.001, default: 0.01 },
    damping: { kind: "number", group: "Harmonograph", label: "Damping", min: 0, max: 0.03, step: 0.0005, default: 0.004 },
    cycles: { kind: "int", group: "Harmonograph", label: "Swings", min: 5, max: 300, default: 80 },
    fill: { kind: "number", group: "Look", label: "Fill", min: 0.2, max: 1, step: 0.01, default: 0.9 },
    lineWidth: { kind: "number", group: "Look", label: "Line width", min: 0.0003, max: 0.01, step: 0.0001, default: 0.0012 },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const regions: readonly Box[] = v.placement === "cells" && scene.cells.length ? scene.cells : [scene.frame];
    // Bound the total work so a fine grid in cell mode stays drawable.
    const budget = Math.max(200, Math.floor(160000 / regions.length));
    const rng = ctx.rng("figure");
    const under = colorLookup(scene);
    const items: Item[] = regions.flatMap((b): Item[] => {
      // Seven draws per figure, whatever the mode.
      const uTurn = rng();
      const uVar = rng();
      const p = [rng(), rng(), rng(), rng()].map((u) => u * TAU);
      const uColor = rng();
      if (b.w <= 0 || b.h <= 0) return [];
      let pts: Pt[];
      let extent: number;
      if (v.mode === "spirograph") {
        const R = v.ring;
        const r = Math.max(2, Math.min(R - 1, Math.round(v.wheel * (1 - v.variety * uVar * 0.8))));
        const d = v.pen * r;
        const laps = r / gcd(R, r);
        const steps = Math.min(budget, Math.max(120, laps * 90));
        const k = (R - r) / r;
        pts = Array.from({ length: steps + 1 }, (_, s): Pt => {
          const t = (s / steps) * laps * TAU;
          return [(R - r) * dcos(t) + d * dcos(k * t), (R - r) * dsin(t) - d * dsin(k * t)];
        });
        extent = R - r + d;
      } else {
        const [fx, fy] = RATIOS[v.ratio] ?? [2, 3];
        const steps = Math.min(budget, v.cycles * 60);
        const dt = (v.cycles * TAU) / steps;
        const q = 1 - v.damping * dt;
        let decay = 1;
        const det = v.detune * (uVar - 0.5) * 2;
        pts = Array.from({ length: steps + 1 }, (_, s): Pt => {
          const t = s * dt;
          const pt: Pt = [
            decay * (dsin(fx * t + (p[0] ?? 0)) + 0.5 * dsin((fx + det) * t + (p[1] ?? 0))),
            decay * (dsin(fy * t + (p[2] ?? 0)) + 0.5 * dsin((fy - det) * t + (p[3] ?? 0))),
          ];
          decay *= q;
          return pt;
        });
        extent = 1.5;
      }
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const stroke = pickColor(scene, v.colorRule, uColor, [cx, cy], v.color, under);
      return [{ type: "polyline", points: fit(pts, extent, b, v.fill, uTurn * TAU), stroke, strokeWidth: v.lineWidth }];
    });
    return addItems(scene, items);
  },
});
