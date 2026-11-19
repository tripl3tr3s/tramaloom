import type { ArtDocument } from "./document.ts";

/** Starter document. Original composition; not modelled on any artist's piece. */
export const starterDocument: ArtDocument = {
  version: 1,
  name: "Starter",
  layers: [
    { id: "canvas", module: "canvas", enabled: true, params: {} },
    {
      id: "palette",
      module: "palette",
      enabled: true,
      params: {
        palette: {
          value: "harbor",
          vary: { kind: "weights", weights: { harbor: 3, lagoon: 2, ember: 1, moss: 1, signal: 1 } },
        },
        background: { value: "middle", vary: { kind: "weights", weights: { first: 1, middle: 3 } } },
        zoneMode: {
          value: "split-x",
          vary: { kind: "weights", weights: { "split-x": 3, diagonal: 2, radial: 1, noise: 2 } },
        },
      },
    },
    {
      id: "grid",
      module: "grid",
      enabled: true,
      params: {
        cols: { value: 12, vary: { kind: "range", min: 8, max: 18, dist: "uniform" } },
        subdivDepth: { value: 1 },
        splitChance: { value: 0.2, vary: { kind: "range", min: 0.05, max: 0.4, dist: "low" } },
      },
    },
    { id: "fill", module: "cellFill", enabled: true, params: { fillChance: { value: 0.8 } } },
  ],
};
