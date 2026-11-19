import { shuffled } from "../prng/distributions.ts";
import { makeNoise2D } from "../prng/noise.ts";
import { PALETTE_NAMES, PALETTES } from "../palettes/palettes.ts";
import type { PaletteState } from "../scene.ts";
import { defineModule } from "./types.ts";

export const ZONE_MODES = ["none", "split-x", "split-y", "quadrants", "diagonal", "radial", "noise"] as const;

export const paletteModule = defineModule({
  id: "palette",
  label: "Palette",
  description: "Chooses colors and splits the canvas into color zones.",
  params: {
    palette: { kind: "enum", label: "Palette", options: PALETTE_NAMES, default: "harbor" },
    shuffle: { kind: "bool", label: "Shuffle order", default: false },
    zoneMode: { kind: "enum", label: "Zones", options: ZONE_MODES, default: "split-x" },
    zoneCount: { kind: "int", label: "Zone count", min: 1, max: 4, default: 2 },
    colorsPerZone: { kind: "int", label: "Colors per zone", min: 1, max: 5, default: 3 },
    zoneShift: { kind: "int", label: "Zone shift", min: 0, max: 4, default: 2 },
    background: {
      kind: "enum",
      label: "Background",
      options: ["canvas", "first", "middle", "last"],
      default: "canvas",
      help: "canvas keeps the Canvas layer color; otherwise take a palette slot",
    },
    noiseScale: { kind: "number", label: "Noise scale", min: 0.5, max: 8, step: 0.1, default: 2 },
  },
  apply(scene, v, ctx) {
    const base = PALETTES[v.palette];
    const colors = v.shuffle ? shuffled(ctx.rng("shuffle"), base) : [...base];
    const n = colors.length;
    const zc = v.zoneMode === "none" ? 1 : v.zoneCount;
    const zoneColors = Array.from({ length: zc }, (_, i) =>
      Array.from({ length: v.colorsPerZone }, (_, j) => colors[(i * v.zoneShift + j) % n] as string),
    );

    const noise = makeNoise2D(ctx.rng("zones"));
    const { width, height } = scene;
    const toZone = (t: number): number => Math.min(zc - 1, Math.max(0, Math.floor(t * zc)));
    const zoneAt = (x: number, y: number): number => {
      const u = x / width;
      const w = y / height;
      switch (v.zoneMode) {
        case "none":
          return 0;
        case "split-x":
          return toZone(u);
        case "split-y":
          return toZone(w);
        case "quadrants":
          return ((u >= 0.5 ? 1 : 0) + (w >= 0.5 ? 2 : 0)) % zc;
        case "diagonal":
          return toZone((u + w) / 2);
        case "radial": {
          const dx = u - 0.5;
          const dy = w - 0.5;
          return toZone(Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2);
        }
        case "noise":
          return toZone((noise(u * v.noiseScale, w * v.noiseScale) - 0.2) / 0.6);
      }
    };

    const palette: PaletteState = { name: v.palette, colors, zoneCount: zc, zoneColors, zoneAt };
    const slot = { canvas: -1, first: 0, middle: Math.floor(n / 2), last: n - 1 }[v.background];
    const background = slot >= 0 ? (colors[slot] ?? scene.background) : scene.background;
    return { ...scene, background, palette };
  },
});
