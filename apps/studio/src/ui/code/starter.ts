import type { LayerScript } from "@gridloom/core";
import { SCRIPT_API } from "@gridloom/core";

/**
 * The code a new Script layer starts with. It must run as it is, teach through its comments,
 * and draw lines a pen plotter can follow. `params` must match what the code declares
 * (test/script.test.ts compiles it to check).
 */
const code = `// A script layer: your own drawing code. Edit anything and the picture redraws.
// layer({ ... }) describes the layer: its name, its settings and how it draws.
layer({
  label: "Rings",

  // Each setting appears in the panel on the right, with vary and lock like any other.
  params: {
    rings: { kind: "int", label: "Rings", help: "How many rings in each cell", min: 1, max: 12, default: 4 },
    wobble: { kind: "number", label: "Wobble", help: "How far each ring strays from the centre", min: 0, max: 1, step: 0.01, default: 0.3 },
    ink: { kind: "color", label: "Ink", help: "Color of the lines", default: "#1d3557" },
  },

  // Runs once per picture. v holds this seed's value of each setting (v.rings, v.wobble, v.ink).
  // ctx.rng("name") gives random numbers decided by the seed: same seed, same picture.
  apply(scene, v, ctx) {
    const rng = ctx.rng("rings");
    const items = [];

    // The cells of the Grid layer above, or the whole frame when there is none.
    // Positions are measured so that the short side of the canvas is 1.
    const cells = scene.cells.length > 0 ? scene.cells : [scene.frame];

    for (const cell of cells) {
      const cx = cell.x + cell.w / 2;
      const cy = cell.y + cell.h / 2;
      const size = Math.min(cell.w, cell.h) / 2;
      for (let i = 1; i <= v.rings; i++) {
        const r = (size * i) / (v.rings + 1);
        const dx = (rng() - 0.5) * v.wobble * (size - r);
        const dy = (rng() - 0.5) * v.wobble * (size - r);
        // Shapes: rect, circle, polyline and dots. A stroke and no fill draws an outline.
        items.push({ type: "circle", cx: cx + dx, cy: cy + dy, r, stroke: v.ink, strokeWidth: 0.002 });
      }
    }

    // Hand the scene on with the new shapes added.
    return addItems(scene, items);
  },
});
`;

export const STARTER_SCRIPT: LayerScript = {
  api: SCRIPT_API,
  label: "Rings",
  code,
  params: {
    rings: { kind: "int", label: "Rings", help: "How many rings in each cell", min: 1, max: 12, default: 4 },
    wobble: { kind: "number", label: "Wobble", help: "How far each ring strays from the centre", min: 0, max: 1, step: 0.01, default: 0.3 },
    ink: { kind: "color", label: "Ink", help: "Color of the lines", default: "#1d3557" },
  },
};
