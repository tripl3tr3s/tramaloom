import { defineModule } from "./types.ts";

export const ASPECTS = ["1:1", "3:4", "4:5", "2:3", "1:1.414", "4:3", "5:4", "3:2", "16:9", "9:16"] as const;

function parseAspect(a: string): { width: number; height: number } {
  const [w, h] = a.split(":").map(Number);
  const ratio = (w ?? 1) / (h ?? 1);
  return ratio >= 1 ? { width: ratio, height: 1 } : { width: 1, height: 1 / ratio };
}

export const canvasModule = defineModule({
  id: "canvas",
  label: "Canvas",
  description: "Format, margin and background. Always the first layer.",
  params: {
    aspect: { kind: "enum", label: "Aspect", help: "Width to height of the piece", options: ASPECTS, default: "3:4" },
    margin: { kind: "number", label: "Margin", help: "Empty border around the artwork, as a share of the short side", min: 0, max: 0.25, step: 0.005, default: 0.06 },
    background: { kind: "color", label: "Background", help: "Color behind everything; the Palette layer's Background can replace it", default: "#2f7fd8" },
    cornerRadius: { kind: "number", label: "Corner radius", help: "Rounds the canvas corners; 0 keeps them square, which a seamless tile needs", min: 0, max: 0.1, step: 0.002, default: 0.03 },
  },
  apply(scene, v) {
    const { width, height } = parseAspect(v.aspect);
    const m = v.margin;
    return {
      ...scene,
      width,
      height,
      frame: { x: m, y: m, w: width - 2 * m, h: height - 2 * m },
      background: v.background,
      cornerRadius: v.cornerRadius,
    };
  },
});
