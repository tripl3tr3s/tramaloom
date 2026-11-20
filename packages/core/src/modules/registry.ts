import { canvasModule } from "./canvas.ts";
import { cellFillModule } from "./cellFill.ts";
import { circuitsModule } from "./circuits.ts";
import { flowModule } from "./flow.ts";
import { gridModule } from "./grid.ts";
import { halftoneModule } from "./halftone.ts";
import { hatchModule } from "./hatch.ts";
import { insetsModule } from "./insets.ts";
import { mazeModule } from "./maze.ts";
import { paletteModule } from "./palette.ts";
import { postModule } from "./post.ts";
import { symmetryModule } from "./symmetry.ts";
import { tilesModule } from "./tiles.ts";
import type { ModuleDef } from "./types.ts";

export type Registry = Readonly<Record<string, ModuleDef>>;

// Widen each def's literal param types for storage in a shared map.
const asDef = (m: unknown): ModuleDef => m as ModuleDef;

/** Own-property lookup: never resolves Object.prototype names like "constructor". */
export const getModule = (registry: Registry, id: string): ModuleDef | undefined =>
  Object.hasOwn(registry, id) ? registry[id] : undefined;

export const defaultRegistry: Registry = {
  canvas: asDef(canvasModule),
  grid: asDef(gridModule),
  palette: asDef(paletteModule),
  cellFill: asDef(cellFillModule),
  insets: asDef(insetsModule),
  tiles: asDef(tilesModule),
  circuits: asDef(circuitsModule),
  maze: asDef(mazeModule),
  halftone: asDef(halftoneModule),
  hatch: asDef(hatchModule),
  flow: asDef(flowModule),
  symmetry: asDef(symmetryModule),
  post: asDef(postModule),
};
