import { generate } from "./document.ts";
import type { ArtDocument } from "./document.ts";
import { builtinPresets } from "./presets.ts";
import { toSVG } from "./render/svg.ts";
import { seedSeries, traitsFromResolved } from "./traits.ts";

export interface CheckCase {
  readonly name: string;
  readonly doc: ArtDocument;
  readonly hash: string;
}

/** Every built-in preset at a few seeds: the cases a cross-environment check compares. */
export function checkCases(perPreset = 3): CheckCase[] {
  const presets = builtinPresets.flatMap((p) => seedSeries(p.hash, perPreset).map((hash, i) => ({ name: `${p.id}/${i}`, doc: p.doc, hash })));
  return [...presets, ...seedSeries(GAUSS_HASH, perPreset).map((hash, i) => ({ name: `distributions/${i}`, doc: distributionsDoc, hash }))];
}

const GAUSS_HASH = "3141592653589793238462643383279502884197169399375105820974944592";

/** Exercises every resolve distribution (gaussian, low, high) the presets do not use. */
const distributionsDoc: ArtDocument = {
  version: 1,
  name: "Distributions",
  layers: [
    { id: "canvas", module: "canvas", enabled: true, params: {} },
    { id: "palette", module: "palette", enabled: true, params: {} },
    {
      id: "grid",
      module: "grid",
      enabled: true,
      params: {
        cols: { value: 10, vary: { kind: "range", min: 6, max: 16, dist: "gaussian" } },
        splitChance: { value: 0.2, vary: { kind: "range", min: 0, max: 0.6, dist: "low" } },
        subdivDepth: { value: 1 },
      },
    },
    { id: "fill", module: "cellFill", enabled: true, params: { fillChance: { value: 0.7, vary: { kind: "range", min: 0.4, max: 1, dist: "high" } } } },
    { id: "rings", module: "insets", enabled: true, params: { offset: { value: 0.1, vary: { kind: "range", min: 0.02, max: 0.3, dist: "gaussian" } } } },
  ],
  traits: [{ name: "Columns", layerId: "grid", param: "cols" }],
};

/**
 * The exact text whose digest must match in every engine: the full SVG display
 * list plus the traits. Hashing is left to the caller (Node crypto, Web Crypto).
 */
export function checkPayload(c: CheckCase): string {
  const out = generate(c.doc, c.hash);
  return `${toSVG(out.scene)}\n${JSON.stringify(traitsFromResolved(c.doc, out.resolved))}`;
}
