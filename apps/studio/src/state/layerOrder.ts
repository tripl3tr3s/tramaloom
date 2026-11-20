import type { Layer } from "@gridloom/core";

/**
 * Where a module belongs in the stack. Layers run top to bottom: the palette and
 * grid set up what drawing layers use, symmetry folds what is above it, post
 * finishes the picture. Unknown modules count as drawing layers.
 */
const STAGE: Readonly<Record<string, number>> = { canvas: 0, palette: 1, grid: 2, symmetry: 4, post: 5 };
const stageOf = (module: string): number => STAGE[module] ?? 3;

/** Index for a new layer of `module`: after everything at its stage or earlier. Canvas stays first. */
export function insertIndex(layers: readonly Layer[], module: string): number {
  const s = stageOf(module);
  const after = layers.findIndex((l, i) => i > 0 && stageOf(l.module) > s);
  return after === -1 ? layers.length : after;
}

/** Modules that draw into the grid's cells or route on its lattice: with no grid above, they draw nothing. */
const GRID_USERS: ReadonlySet<string> = new Set(["cellFill", "insets", "tiles", "circuits", "maze", "halftone", "hatch"]);

/** The layer at `index` needs a grid and no enabled Grid layer runs before it. */
export function needsGrid(layers: readonly Layer[], index: number): boolean {
  const l = layers[index];
  if (!l || !l.enabled || !GRID_USERS.has(l.module)) return false;
  return !layers.slice(0, index).some((x) => x.enabled && x.module === "grid");
}
