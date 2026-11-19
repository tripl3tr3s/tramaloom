import type { ArtDocument, Layer } from "./document.ts";
import type { ParamSetting } from "./params/params.ts";

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

export interface Preset {
  readonly id: string;
  readonly doc: ArtDocument;
  /** Seed shown on the preset's thumbnail and loaded with it. */
  readonly hash: string;
}

type Params = Readonly<Record<string, ParamSetting>>;
const L = (id: string, module: string, params: Params = {}): Layer => ({ id, module, enabled: true, params });
const fixed = (v: string | number | boolean): ParamSetting => ({ value: v });
const range = (value: number, min: number, max: number, dist: "uniform" | "low" | "high" | "gaussian" = "uniform"): ParamSetting => ({
  value,
  vary: { kind: "range", min, max, dist },
});
const pick = (value: string | number, weights: Readonly<Record<string, number>>): ParamSetting => ({
  value,
  vary: { kind: "weights", weights },
});
const doc = (name: string, layers: readonly Layer[]): ArtDocument => ({ version: 1, name, layers });

/**
 * Built-in presets. All original compositions that show off the modules; none
 * is modelled on a particular artist's piece. Each varies with the seed.
 */
export const builtinPresets: readonly Preset[] = [
  { id: "starter", doc: starterDocument, hash: "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921" },
  {
    id: "breadboard",
    hash: "5b1e0c9d7a3f4e2b8c6d1a0f9e8b7c6d5a4f3e2d1c0b9a8f7e6d5c4b3a291807",
    doc: doc("Breadboard", [
      L("canvas", "canvas", { aspect: fixed("4:5"), margin: fixed(0.07) }),
      L("palette", "palette", { palette: pick("ink", { ink: 3, harbor: 2, moss: 1 }), zoneMode: pick("noise", { noise: 2, "split-y": 1 }), background: fixed("first") }),
      L("grid", "grid", { cols: range(12, 9, 15), subdivDepth: fixed(0) }),
      L("fill", "cellFill", { fillChance: range(0.5, 0.35, 0.65), shape: fixed("rounded"), roundness: fixed(0.12), inset: fixed(0.12) }),
      L("traces", "circuits", {
        style: fixed("tree"),
        nodes: fixed("corners"),
        resolution: fixed(2),
        wires: range(5, 3, 8),
        turnChance: range(0.08, 0, 0.2),
        coverage: range(0.45, 0.3, 0.6),
        junctions: fixed(true),
        endTerminal: pick("ring", { ring: 3, frame: 1, dot: 1 }),
        wireWidth: fixed(0.14),
      }),
      L("post", "post", { grain: fixed(0.3) }),
    ]),
  },
  {
    id: "weave",
    hash: "c0ffee0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    doc: doc("Weave", [
      L("canvas", "canvas", { aspect: fixed("3:4") }),
      L("palette", "palette", { palette: pick("lagoon", { lagoon: 2, bloom: 1, orchard: 1 }), zoneMode: pick("diagonal", { diagonal: 1, radial: 1, noise: 1 }) }),
      L("grid", "grid", { cols: range(9, 7, 12), subdivDepth: fixed(1), splitChance: range(0.15, 0, 0.3, "low") }),
      L("fill", "cellFill", { fillChance: fixed(1) }),
      L("arcs", "tiles", { lines: range(3, 2, 4), lineWidth: fixed(0.07), rotation: pick("random", { random: 2, noise: 1 }) }),
      L("post", "post", { grain: fixed(0.2) }),
    ]),
  },
  {
    id: "quilt",
    hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    doc: doc("Quilt", [
      L("canvas", "canvas", { aspect: fixed("1:1"), margin: fixed(0.08) }),
      L("palette", "palette", { palette: pick("orchard", { orchard: 2, ember: 1, bloom: 1, signal: 1 }), zoneMode: fixed("radial"), zoneCount: range(3, 2, 4) }),
      L("grid", "grid", { cols: pick(8, { "6": 1, "8": 2, "10": 1 }), fit: fixed("square"), rows: fixed(8) }),
      L("fill", "cellFill", { fillChance: fixed(1) }),
      L("tri", "tiles", { motif: pick("triangle", { triangle: 3, quarter: 2, mixed: 1 }), rotation: pick("random", { random: 2, checker: 1 }), colorRule: fixed("zone") }),
      L("mirror", "symmetry", { mode: pick("quad", { quad: 3, "rotate-4": 2 }) }),
      L("post", "post", { border: fixed(true), borderOffset: fixed(0.025), grain: fixed(0.15) }),
    ]),
  },
  {
    id: "nest",
    hash: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
    doc: doc("Nest", [
      L("canvas", "canvas", { aspect: fixed("4:5") }),
      L("palette", "palette", { palette: pick("ember", { ember: 2, harbor: 1, signal: 1 }), zoneMode: pick("split-x", { "split-x": 1, quadrants: 1 }) }),
      L("grid", "grid", { cols: range(7, 5, 9), subdivDepth: fixed(2), splitChance: range(0.35, 0.2, 0.5) }),
      L("fill", "cellFill", { fillChance: fixed(1) }),
      L("rings", "insets", { chance: range(0.55, 0.35, 0.75), rings: range(4, 2, 6), shape: pick("square", { square: 3, circle: 1, mixed: 1 }), roundness: fixed(0.08) }),
    ]),
  },
  {
    id: "totem",
    hash: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2918070f1e2d3c4b5a69788796a5b4",
    doc: doc("Totem", [
      L("canvas", "canvas", { aspect: fixed("2:3"), margin: fixed(0.08) }),
      L("palette", "palette", { palette: pick("signal", { signal: 2, moss: 1, lagoon: 1 }), zoneMode: fixed("split-y"), zoneCount: fixed(3) }),
      L("grid", "grid", { cols: pick(10, { "8": 1, "10": 2, "12": 1 }), subdivDepth: fixed(1), splitChance: fixed(0.2) }),
      L("fill", "cellFill", { fillChance: range(0.75, 0.6, 0.9) }),
      L("rings", "insets", { chance: fixed(0.4), cells: fixed("small"), style: fixed("stroke"), rings: fixed(2) }),
      L("wires", "circuits", { wires: range(14, 8, 20), maxLength: fixed(10), corner: fixed("round"), endTerminal: fixed("dot") }),
      L("mirror", "symmetry", { mode: fixed("mirror-x") }),
      L("post", "post", { jitter: fixed(0.08), grain: fixed(0.35) }),
    ]),
  },
];
