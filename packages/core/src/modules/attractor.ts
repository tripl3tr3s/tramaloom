import { dcos, dsin } from "../math/trig.ts";
import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor, rampColors } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
const WARMUP = 100;

/**
 * Strange attractors: a point hops by a fixed rule many thousands of times and the
 * hops trace a shape. Clifford: x' = sin(a y) + c cos(a x), y' = sin(b x) + d cos(b y).
 * de Jong: x' = sin(a y) - cos(b x), y' = sin(c x) - cos(d y). Deterministic trig,
 * so every engine traces exactly the same cloud.
 */
export const attractorModule = defineModule({
  id: "attractor",
  label: "Attractor",
  description: "A strange attractor: one point hopping by a fixed rule, thousands of times, fitted to the frame as a cloud of dots.",
  params: {
    kind: { kind: "enum", group: "Rule", label: "Rule", help: "The hopping rule; each gives a different family of shapes", options: ["clifford", "dejong"], default: "clifford" },
    a: { kind: "number", group: "Rule", label: "a", help: "Rule constant; small changes reshape the cloud, and some values collapse it to a point", min: -3, max: 3, step: 0.01, default: -1.4 },
    b: { kind: "number", group: "Rule", label: "b", help: "Rule constant; small changes reshape the cloud, and some values collapse it to a point", min: -3, max: 3, step: 0.01, default: 1.6 },
    c: { kind: "number", group: "Rule", label: "c", help: "Rule constant; small changes reshape the cloud, and some values collapse it to a point", min: -3, max: 3, step: 0.01, default: 1 },
    d: { kind: "number", group: "Rule", label: "d", help: "Rule constant; small changes reshape the cloud, and some values collapse it to a point", min: -3, max: 3, step: 0.01, default: 0.7 },
    points: { kind: "int", group: "Dots", label: "Points", help: "Number of hops plotted; more is denser and slower", min: 1000, max: 120000, default: 30000 },
    dotSize: { kind: "number", group: "Dots", label: "Dot size", help: "Radius of each dot, as a share of the short side", min: 0.0002, max: 0.004, step: 0.0001, default: 0.0009 },
    opacity: { kind: "number", group: "Dots", label: "Opacity", help: "Dot opacity; low values let busy parts of the cloud build up", min: 0.05, max: 1, step: 0.01, default: 0.7 },
    fill: { kind: "number", group: "Dots", label: "Fill", help: "How much of the frame the cloud covers", min: 0.3, max: 1, step: 0.01, default: 0.9 },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: [...COLOR_RULES, "ramp"], default: "ramp", help: colorHelp({ ramp: true }) },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const f = scene.frame;
    if (f.w <= 0 || f.h <= 0) return scene;
    const step = ([x, y]: Pt): Pt =>
      v.kind === "clifford"
        ? [dsin(v.a * y) + v.c * dcos(v.a * x), dsin(v.b * x) + v.d * dcos(v.b * y)]
        : [dsin(v.a * y) - dcos(v.b * x), dsin(v.c * x) - dcos(v.d * y)];
    let p: Pt = [0.1, 0.1];
    for (let i = 0; i < WARMUP; i++) p = step(p);
    const raw: Pt[] = [];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < v.points; i++) {
      p = step(p);
      raw.push(p);
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
    if (x1 - x0 < 1e-9 && y1 - y0 < 1e-9) {
      // The orbit collapsed onto a fixed point: one dot says so honestly.
      const fill = pickColor(scene, v.colorRule === "ramp" ? "palette" : v.colorRule, ctx.rng("color")(), [f.x + f.w / 2, f.y + f.h / 2], v.color, colorLookup(scene));
      return addItems(scene, [{ type: "dots", points: [[f.x + f.w / 2, f.y + f.h / 2]], r: v.dotSize * 3, fill, opacity: v.opacity }]);
    }
    const w = x1 - x0 || 1;
    const h = y1 - y0 || 1;
    const k = Math.min((f.w * v.fill) / w, (f.h * v.fill) / h);
    const ox = f.x + (f.w - w * k) / 2 - x0 * k;
    const oy = f.y + (f.h - h * k) / 2 - y0 * k;
    const pts = raw.map(([x, y]): Pt => [ox + x * k, oy + y * k]);

    const pal = rampColors(scene);
    const colorRng = ctx.rng("color");
    const uColor = colorRng();
    if (v.colorRule !== "ramp" || !pal.length) {
      const fill = pickColor(scene, v.colorRule === "ramp" ? "palette" : v.colorRule, uColor, [f.x + f.w / 2, f.y + f.h / 2], v.color, colorLookup(scene));
      return addItems(scene, [{ type: "dots", points: pts, r: v.dotSize, fill, opacity: v.opacity }]);
    }
    // Ramp: one dot batch per palette color, banded by distance from the cloud's centre.
    const cx = ox + ((x0 + x1) / 2) * k;
    const cy = oy + ((y0 + y1) / 2) * k;
    const reach = Math.sqrt((w * k * w * k + h * k * h * k) / 4) || 1;
    const bands: Pt[][] = pal.map(() => []);
    for (const q of pts) {
      const t = Math.sqrt((q[0] - cx) * (q[0] - cx) + (q[1] - cy) * (q[1] - cy)) / reach;
      bands[Math.min(pal.length - 1, Math.floor(t * pal.length))]?.push(q);
    }
    const items: Item[] = bands.flatMap((points, i): Item[] => (points.length ? [{ type: "dots", points, r: v.dotSize, fill: pal[i] ?? v.color, opacity: v.opacity }] : []));
    return addItems(scene, items);
  },
});
