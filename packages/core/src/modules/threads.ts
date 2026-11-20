import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
const STEPS = 32;

/**
 * Threads strung between anchors on the frame edges, each sagging under its own
 * weight (a parabola, drawn as a quadratic curve). Anchors can snap to the grid
 * lines so the threads hang from the same rhythm as the cells.
 */
export const threadsModule = defineModule({
  id: "threads",
  label: "Threads",
  description: "Threads hung between the frame edges, sagging under their weight: a loose web, a loom's warp, or hammocks from side to side.",
  params: {
    mode: { kind: "enum", group: "Threads", label: "Hang", options: ["web", "warp", "hammock"], default: "web", help: "web: any edge to another; warp: top to bottom; hammock: side to side" },
    count: { kind: "int", group: "Threads", label: "Threads", min: 1, max: 400, default: 60 },
    sag: { kind: "number", group: "Threads", label: "Sag", min: 0, max: 0.6, step: 0.01, default: 0.18, help: "How far a thread droops, as a share of its length" },
    sagJitter: { kind: "number", group: "Threads", label: "Sag variation", min: 0, max: 1, step: 0.01, default: 0.5 },
    drift: { kind: "number", group: "Threads", label: "Drift", min: 0, max: 1, step: 0.01, default: 0.25, help: "warp and hammock: how far a thread wanders from straight across" },
    snap: { kind: "bool", group: "Threads", label: "Snap to grid", default: false, help: "Anchor on the grid's lines" },
    lineWidth: { kind: "number", group: "Look", label: "Line width", min: 0.0005, max: 0.012, step: 0.0005, default: 0.002 },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const f = scene.frame;
    if (f.w <= 0 || f.h <= 0) return scene;
    const L = scene.lattice;
    const snapX = (x: number): number => (v.snap && L ? Math.min(f.x + f.w, Math.max(f.x, L.x + Math.round((x - L.x) / L.cw) * L.cw)) : x);
    const snapY = (y: number): number => (v.snap && L ? Math.min(f.y + f.h, Math.max(f.y, L.y + Math.round((y - L.y) / L.ch) * L.ch)) : y);
    // Edge 0 top, 1 right, 2 bottom, 3 left; t runs along it.
    const onEdge = (edge: number, t: number): Pt => {
      switch (edge) {
        case 0:
          return [snapX(f.x + t * f.w), f.y];
        case 1:
          return [f.x + f.w, snapY(f.y + t * f.h)];
        case 2:
          return [snapX(f.x + t * f.w), f.y + f.h];
        default:
          return [f.x, snapY(f.y + t * f.h)];
      }
    };
    const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

    const rng = ctx.rng("thread");
    const under = colorLookup(scene);
    const items: Item[] = Array.from({ length: v.count }, (): Item => {
      // Five draws per thread, in this order, whatever the mode.
      const uA = rng();
      const uB = rng();
      const uC = rng();
      const uSag = rng();
      const uColor = rng();
      const [a, b] = ((): readonly [Pt, Pt] => {
        switch (v.mode) {
          case "warp":
            return [onEdge(0, uA), onEdge(2, clamp01(uA + (uB - 0.5) * v.drift))];
          case "hammock":
            return [onEdge(3, uA), onEdge(1, clamp01(uA + (uB - 0.5) * v.drift))];
          case "web": {
            const ea = Math.floor(uA * 4);
            const eb = (ea + 1 + Math.floor(uC * 3)) % 4;
            return [onEdge(ea, uA * 4 - ea), onEdge(eb, uB)];
          }
        }
      })();
      const len = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      const droop = v.sag * len * (1 - v.sagJitter * uSag);
      // Control point below the middle; a quadratic dips half as far as its control point.
      const mx = (a[0] + b[0]) / 2;
      const lowest = f.y + f.h;
      const cy = Math.min((a[1] + b[1]) / 2 + 2 * droop, 2 * lowest - (a[1] + b[1]) / 2);
      const points = Array.from({ length: STEPS + 1 }, (_, s): Pt => {
        const t = s / STEPS;
        const u = 1 - t;
        return [u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
      });
      return { type: "polyline", points, stroke: pickColor(scene, v.colorRule, uColor, [mx, (a[1] + cy) / 2], v.color, under), strokeWidth: v.lineWidth };
    });
    return addItems(scene, items);
  },
});
