import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { defineModule } from "./types.ts";

// Specks per unit area at grain 1. Density follows area, so every aspect looks alike.
const DENSITY = 40000;
// Opacity is quantised so specks batch into a handful of paths (2 tones x LEVELS).
const LEVELS = 8;

export const postModule = defineModule({
  id: "post",
  label: "Post",
  description: "Finishing: hand-made jitter on everything below, an optional border, and film grain on top.",
  params: {
    jitter: {
      kind: "number",
      group: "Jitter",
      label: "Jitter",
      min: 0,
      max: 1,
      step: 0.01,
      default: 0,
      help: "Nudges each shape on its own (1 is about 1% of the short side); neighbours separate, so keep it low for flush grids",
    },
    border: { kind: "bool", group: "Border", label: "Border", default: false },
    borderOffset: {
      kind: "number",
      group: "Border",
      label: "Border offset",
      min: 0,
      max: 0.05,
      step: 0.001,
      default: 0.015,
      help: "Distance outside the artwork frame; limited so the line stays on the canvas",
    },
    borderWidth: { kind: "number", group: "Border", label: "Border width", min: 0.001, max: 0.03, step: 0.0005, default: 0.004 },
    borderColor: { kind: "color", group: "Border", label: "Border color", default: "#0d1b2a" },
    grain: { kind: "number", group: "Grain", label: "Grain", min: 0, max: 1, step: 0.01, default: 0.25 },
    grainSize: { kind: "number", group: "Grain", label: "Grain size", min: 0.0005, max: 0.004, step: 0.0001, default: 0.0012 },
    grainTone: { kind: "enum", group: "Grain", label: "Grain tone", options: ["both", "light", "dark"], default: "both" },
  },
  apply(scene, v, ctx) {
    // Jitter: two draws per existing item, always, so the jitter amount never reshuffles anything.
    const jr = ctx.rng("jitter");
    const amp = v.jitter * 0.01;
    const moved = scene.items.map((it): Item => {
      const dx = (jr() * 2 - 1) * amp;
      const dy = (jr() * 2 - 1) * amp;
      if (amp === 0) return it;
      switch (it.type) {
        case "rect":
          return { ...it, x: it.x + dx, y: it.y + dy };
        case "circle":
          return { ...it, cx: it.cx + dx, cy: it.cy + dy };
        case "polyline":
        case "dots":
          return { ...it, points: it.points.map(([x, y]) => [x + dx, y + dy] as const) };
      }
    });

    const { frame } = scene;
    // Keep the whole stroke on the canvas, whatever the margin.
    const room = Math.min(frame.x, frame.y, scene.width - frame.x - frame.w, scene.height - frame.y - frame.h);
    // With no margin to spare this goes negative and the border tucks inside the frame.
    const o = Math.min(v.borderOffset, room - v.borderWidth / 2);
    const border: Item[] = v.border
      ? [
          {
            type: "rect",
            x: frame.x - o,
            y: frame.y - o,
            w: frame.w + 2 * o,
            h: frame.h + 2 * o,
            stroke: v.borderColor,
            strokeWidth: v.borderWidth,
          },
        ]
      : [];

    // Grain: specks come from one stream with exactly four draws each, so more grain only adds specks.
    const gr = ctx.rng("grain");
    const count = Math.round(v.grain * DENSITY * scene.width * scene.height);
    // Local buckets, one per tone and opacity level, filled in draw order.
    const buckets: (readonly [number, number])[][] = Array.from({ length: 2 * LEVELS }, () => []);
    for (let k = 0; k < count; k++) {
      const x = gr() * scene.width;
      const y = gr() * scene.height;
      const light = v.grainTone === "light" || (v.grainTone === "both" && gr() < 0.5);
      if (v.grainTone !== "both") gr();
      const level = Math.min(LEVELS - 1, Math.floor(gr() * LEVELS));
      buckets[(light ? LEVELS : 0) + level]?.push([x, y]);
    }
    const specks: Item[] = buckets.flatMap((points, i): Item[] => {
      if (points.length === 0) return [];
      const light = i >= LEVELS;
      const level = i % LEVELS;
      const opacity = 0.04 + ((level + 0.5) / LEVELS) * 0.14;
      return [{ type: "dots", points, r: v.grainSize / 2, fill: light ? "#ffffff" : "#000000", opacity, texture: true }];
    });

    return addItems({ ...scene, items: moved }, [...border, ...specks]);
  },
});
