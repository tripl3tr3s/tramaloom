import { canvasModule } from "./canvas.ts";
import { cellFillModule } from "./cellFill.ts";
import { gridModule } from "./grid.ts";
import { paletteModule } from "./palette.ts";
import type { ModuleDef } from "./types.ts";

export type Registry = Readonly<Record<string, ModuleDef>>;

// Widen each def's literal param types for storage in a shared map.
const asDef = (m: unknown): ModuleDef => m as ModuleDef;

export const defaultRegistry: Registry = {
  canvas: asDef(canvasModule),
  grid: asDef(gridModule),
  palette: asDef(paletteModule),
  cellFill: asDef(cellFillModule),
};
