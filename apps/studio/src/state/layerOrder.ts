import type { Layer } from "@gridloom/core";

/**
 * The stack has three regions, read from the document's own order so any saved
 * piece keeps rendering exactly as it was:
 * - head: Canvas, then the first Palette and the first Grid. Pinned: never moved,
 *   removed or hidden, because every drawing layer depends on them.
 * - tail: Symmetry then Post at the very end. Pinned in place, but optional.
 * - middle: everything else, freely ordered. Extra Grid, Palette or Symmetry layers
 *   here are the advanced Re-grid, Re-palette and Mirror steps.
 */
export interface Zones {
  /** Layers [0, head) are the pinned head. */
  readonly head: number;
  /** Layers [tail, length) are the pinned tail; the middle is [head, tail). */
  readonly tail: number;
}

const HEAD_MODULES: ReadonlySet<string> = new Set(["palette", "grid"]);

export function zones(layers: readonly Layer[]): Zones {
  let head = layers[0]?.module === "canvas" ? 1 : 0;
  const seen = new Set<string>();
  for (let l = layers[head]; l && HEAD_MODULES.has(l.module) && !seen.has(l.module); l = layers[head]) {
    seen.add(l.module);
    head++;
  }
  let tail = layers.length;
  if (tail > head && layers[tail - 1]?.module === "post") tail--;
  if (tail > head && layers[tail - 1]?.module === "symmetry") tail--;
  return { head, tail };
}

export type Zone = "head" | "middle" | "tail";
export const zoneAt = (layers: readonly Layer[], i: number): Zone => {
  const z = zones(layers);
  return i < z.head ? "head" : i >= z.tail ? "tail" : "middle";
};

const has = (layers: readonly Layer[], from: number, to: number, module: string): boolean =>
  layers.slice(from, to).some((l) => l.module === module);

/**
 * Index for a new layer of `module`. A Palette or Grid fills its pinned head slot
 * when that slot is empty, Symmetry and Post their tail slots; otherwise (and for
 * every drawing module) the layer goes to the end of the middle.
 */
export function insertIndex(layers: readonly Layer[], module: string): number {
  const z = zones(layers);
  const first = layers[0]?.module === "canvas" ? 1 : 0;
  switch (module) {
    case "palette":
      return has(layers, 0, z.head, "palette") ? z.tail : first;
    case "grid":
      return has(layers, 0, z.head, "grid") ? z.tail : z.head;
    case "post":
      return has(layers, z.tail, layers.length, "post") ? z.tail : layers.length;
    default:
      // Symmetry lands just before Post: the tail slot when it is empty, else the middle's end.
      return z.tail;
  }
}

/**
 * Final index that makes a middle Palette or Grid the pinned one, when the head
 * has none; null when that does not apply.
 */
export function promoteIndex(layers: readonly Layer[], layerId: string): number | null {
  const i = layers.findIndex((l) => l.id === layerId);
  const l = layers[i];
  const z = zones(layers);
  if (!l || i < z.head || i >= z.tail || !HEAD_MODULES.has(l.module) || has(layers, 0, z.head, l.module)) return null;
  return l.module === "palette" ? (layers[0]?.module === "canvas" ? 1 : 0) : z.head;
}

/** Modules that draw into the grid's cells or route on its lattice: with no grid above, they draw nothing. */
const GRID_USERS: ReadonlySet<string> = new Set(["cellFill", "insets", "tiles", "circuits", "maze", "halftone", "hatch", "knot", "pipes"]);

/** The layer at `index` needs a grid and no enabled Grid layer runs before it. */
export function needsGrid(layers: readonly Layer[], index: number): boolean {
  const l = layers[index];
  if (!l || !l.enabled || !GRID_USERS.has(l.module)) return false;
  return !layers.slice(0, index).some((x) => x.enabled && x.module === "grid");
}
