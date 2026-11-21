/**
 * Built-in modules a layer can be remixed from. Drawing layers only: Canvas is the frame, and
 * Grid, Palette, Symmetry and Post hold pinned places in the stack that are tied to their module.
 */
export const REMIXABLE: ReadonlySet<string> = new Set([
  "cellFill", "insets", "tiles", "circuits", "maze", "halftone", "hatch", "flow", "contour",
  "knot", "pipes", "packing", "threads", "phyllotaxis", "spiro", "waves", "attractor",
]);
