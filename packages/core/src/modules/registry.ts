import type { Layer } from "../document.ts";
import { SCRIPT_MODULE } from "../script.ts";
import { canvasModule } from "./canvas.ts";
import { scriptModule } from "./script.ts";
import { spiralModule } from "./spiral.ts";
import { ridgelinesModule } from "./ridgelines.ts";
import { attractorModule } from "./attractor.ts";
import { phyllotaxisModule } from "./phyllotaxis.ts";
import { spiroModule } from "./spiro.ts";
import { wavesModule } from "./waves.ts";
import { contourModule } from "./contour.ts";
import { knotModule } from "./knot.ts";
import { packingModule } from "./packing.ts";
import { pipesModule } from "./pipes.ts";
import { threadsModule } from "./threads.ts";
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

/**
 * The definition that applies to one layer. A script layer brings its own label and params
 * (declared by its code, stored as data); every other layer uses its module's definition.
 */
export const layerDef = (registry: Registry, layer: Layer): ModuleDef | undefined => {
  const def = getModule(registry, layer.module);
  if (!def || layer.module !== SCRIPT_MODULE || !layer.script) return def;
  return { ...def, label: layer.script.label || def.label, params: layer.script.params };
};

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
  contour: asDef(contourModule),
  knot: asDef(knotModule),
  pipes: asDef(pipesModule),
  packing: asDef(packingModule),
  threads: asDef(threadsModule),
  phyllotaxis: asDef(phyllotaxisModule),
  spiro: asDef(spiroModule),
  waves: asDef(wavesModule),
  attractor: asDef(attractorModule),
  spiral: asDef(spiralModule),
  ridgelines: asDef(ridgelinesModule),
  symmetry: asDef(symmetryModule),
  post: asDef(postModule),
  script: asDef(scriptModule),
};
