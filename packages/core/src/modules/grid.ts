import { chance } from "../prng/distributions.ts";
import { makeNoise2D } from "../prng/noise.ts";
import type { Cell } from "../scene.ts";
import { defineModule } from "./types.ts";

interface RawCell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly col: number;
  readonly row: number;
  readonly depth: number;
}

export const gridModule = defineModule({
  id: "grid",
  label: "Grid",
  description: "Lays out cells inside the frame, with optional recursive subdivision and masking.",
  params: {
    cols: { kind: "int", label: "Columns", min: 1, max: 64, default: 12 },
    rows: { kind: "int", label: "Rows", min: 1, max: 64, default: 16 },
    fit: {
      kind: "enum",
      label: "Fit",
      options: ["auto", "square", "stretch"],
      default: "auto",
      help: "auto: square cells, rows derived from columns to fill the frame",
    },
    subdivDepth: { kind: "int", label: "Subdivision depth", min: 0, max: 4, default: 0 },
    splitChance: { kind: "number", label: "Split chance", min: 0, max: 1, step: 0.01, default: 0.25 },
    gap: { kind: "number", label: "Gap", min: 0, max: 0.02, step: 0.0005, default: 0 },
    mask: { kind: "enum", label: "Mask", options: ["none", "circle", "diamond", "noise"], default: "none" },
    maskAmount: { kind: "number", label: "Mask amount", min: 0, max: 1, step: 0.01, default: 0.5 },
  },
  apply(scene, v, ctx) {
    const { frame } = scene;
    const rows = v.fit === "auto" ? Math.max(1, Math.round(frame.h / (frame.w / v.cols))) : v.rows;
    const cw0 = frame.w / v.cols;
    const ch0 = frame.h / rows;
    const size = Math.min(cw0, ch0);
    const cw = v.fit === "stretch" ? cw0 : size;
    const ch = v.fit === "stretch" ? ch0 : size;
    const ox = frame.x + (frame.w - cw * v.cols) / 2;
    const oy = frame.y + (frame.h - ch * rows) / 2;

    const splitRng = ctx.rng("split");
    const split = (c: RawCell): RawCell[] => {
      // Always draw, so changing depth or chance does not reshuffle later cells.
      const doSplit = chance(splitRng, v.splitChance);
      if (c.depth >= v.subdivDepth || !doSplit) return [c];
      const hw = c.w / 2;
      const hh = c.h / 2;
      const child = (dx: number, dy: number): RawCell => ({
        ...c,
        x: c.x + dx * hw,
        y: c.y + dy * hh,
        w: hw,
        h: hh,
        depth: c.depth + 1,
      });
      return [child(0, 0), child(1, 0), child(0, 1), child(1, 1)].flatMap(split);
    };

    const base: RawCell[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < v.cols; col++) {
        base.push({ x: ox + col * cw, y: oy + row * ch, w: cw, h: ch, col, row, depth: 0 });
      }
    }

    const noise = makeNoise2D(ctx.rng("mask"));
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const half = Math.min(frame.w, frame.h) / 2;
    const keep = (c: RawCell): boolean => {
      const px = c.x + c.w / 2;
      const py = c.y + c.h / 2;
      const dx = (px - cx) / half;
      const dy = (py - cy) / half;
      switch (v.mask) {
        case "none":
          return true;
        case "circle":
          return Math.sqrt(dx * dx + dy * dy) <= 0.2 + v.maskAmount;
        case "diamond":
          return Math.abs(dx) + Math.abs(dy) <= 0.3 + v.maskAmount * 1.2;
        case "noise":
          return noise(px * 4, py * 4) >= v.maskAmount * 0.8 + 0.1;
      }
    };

    const g = v.gap / 2;
    const cells: Cell[] = base
      .flatMap(split)
      .filter(keep)
      .map((c, id) => ({
        id,
        col: c.col,
        row: c.row,
        depth: c.depth,
        x: c.x + g,
        y: c.y + g,
        w: Math.max(0, c.w - v.gap),
        h: Math.max(0, c.h - v.gap),
      }));

    const kept = new Set(cells.map((c) => c.row * v.cols + c.col));
    const present = Array.from({ length: rows * v.cols }, (_, i) => kept.has(i));
    const lattice = { x: ox, y: oy, cw, ch, cols: v.cols, rows, present };

    return { ...scene, cells, lattice };
  },
});
