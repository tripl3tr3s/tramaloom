import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtDocument, Layer } from "../src/index.ts";
import { ENGINE_VERSION, generate, starterDocument, toSVG } from "../src/index.ts";

/**
 * Frozen output fingerprints. If this fails, an existing module now draws
 * differently, which changes every saved share link. Either restore the old
 * output (new behaviour behind a param whose default keeps it), or bump
 * ENGINE_VERSION and regenerate with: UPDATE_GOLDEN=1 pnpm test
 */
const FILE = join(import.meta.dirname, "golden.json");
const HASHES = [
  "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921",
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
];

const withLayer = (layer: Layer): ArtDocument => ({ ...starterDocument, layers: [...starterDocument.layers, layer] });

const tweak = (doc: ArtDocument, id: string, params: Layer["params"]): ArtDocument => ({
  ...doc,
  layers: doc.layers.map((l) => (l.id === id ? { ...l, params: { ...l.params, ...params } } : l)),
});

const DOCS: Record<string, ArtDocument> = {
  starter: starterDocument,
  circuitsWalk: withLayer({ id: "c", module: "circuits", enabled: true, params: { endTerminal: { value: "mixed" } } }),
  circuitsTree: withLayer({
    id: "c",
    module: "circuits",
    enabled: true,
    params: { style: { value: "tree" }, junctions: { value: true }, corner: { value: "round" }, nodes: { value: "corners" } },
  }),
  // Exercises mask, subdivision, stretch fit, resolution > 1 and non-contrast colors.
  circuitsMasked: tweak(
    withLayer({
      id: "c",
      module: "circuits",
      enabled: true,
      params: { nodes: { value: "corners" }, resolution: { value: 2 }, colorRule: { value: "zone" }, wires: { value: 60 } },
    }),
    "grid",
    { mask: { value: "circle" }, subdivDepth: { value: 2 }, fit: { value: "stretch" }, rows: { value: 20 } },
  ),
  insets: withLayer({ id: "i", module: "insets", enabled: true, params: { shape: { value: "mixed" }, roundness: { value: 0.2 } } }),
  insetsStroke: withLayer({ id: "i", module: "insets", enabled: true, params: { style: { value: "stroke" }, cells: { value: "large" } } }),
  tilesArcs: withLayer({ id: "t", module: "tiles", enabled: true, params: { lines: { value: 3 } } }),
  tilesMixed: withLayer({
    id: "t",
    module: "tiles",
    enabled: true,
    params: { motif: { value: "mixed" }, rotation: { value: "noise" }, colorRule: { value: "zone" } },
  }),
  tilesChecker: withLayer({ id: "t", module: "tiles", enabled: true, params: { motif: { value: "triangle" }, rotation: { value: "checker" } } }),
  symmetryQuad: {
    ...starterDocument,
    layers: [
      ...starterDocument.layers,
      { id: "t", module: "tiles", enabled: true, params: { motif: { value: "mixed" } } },
      { id: "s", module: "symmetry", enabled: true, params: { mode: { value: "quad" } } },
    ],
  },
  symmetryRotate4: {
    ...starterDocument,
    layers: [
      ...starterDocument.layers,
      { id: "c", module: "circuits", enabled: true, params: {} },
      { id: "s", module: "symmetry", enabled: true, params: { mode: { value: "rotate-4" }, source: { value: "second" } } },
    ],
  },
  post: withLayer({
    id: "p",
    module: "post",
    enabled: true,
    params: { jitter: { value: 0.4 }, border: { value: true }, grain: { value: 0.05 }, grainTone: { value: "light" } },
  }),
  mazeWalls: withLayer({ id: "m", module: "maze", enabled: true, params: {} }),
  mazePathsMasked: tweak(
    withLayer({ id: "m", module: "maze", enabled: true, params: { style: { value: "paths" }, braid: { value: 0.5 }, colorRule: { value: "zone" } } }),
    "grid",
    { mask: { value: "circle" } },
  ),
  halftone: withLayer({ id: "h", module: "halftone", enabled: true, params: {} }),
  halftoneRadial: withLayer({ id: "h", module: "halftone", enabled: true, params: { field: { value: "radial" }, shape: { value: "diamond" }, invert: { value: true } } }),
  hatch: withLayer({ id: "x", module: "hatch", enabled: true, params: {} }),
  hatchNoiseCross: withLayer({ id: "x", module: "hatch", enabled: true, params: { direction: { value: "cross" }, lines: { value: 9 } } }),
  flow: withLayer({ id: "f", module: "flow", enabled: true, params: {} }),
  flowMasked: tweak(withLayer({ id: "f", module: "flow", enabled: true, params: { colorRule: { value: "palette" } } }), "grid", { mask: { value: "noise" } }),
  circuitsTreeMixed: withLayer({
    id: "c",
    module: "circuits",
    enabled: true,
    params: {
      style: { value: "tree" },
      wires: { value: 5 },
      turnChance: { value: 0 },
      endTerminal: { value: "mixed" },
      colorRule: { value: "palette" },
    },
  }),
};

const fingerprint = (doc: ArtDocument, hash: string): string =>
  createHash("sha256").update(toSVG(generate(doc, hash).scene)).digest("hex").slice(0, 16);

const current = (): Record<string, unknown> => ({
  engine: ENGINE_VERSION,
  outputs: Object.fromEntries(
    Object.entries(DOCS).flatMap(([name, doc]) => HASHES.map((h) => [`${name}/${h.slice(0, 8)}`, fingerprint(doc, h)])),
  ),
});

describe("golden output", () => {
  it("matches the frozen fingerprints for this engine version", () => {
    if (process.env["UPDATE_GOLDEN"] === "1") writeFileSync(FILE, `${JSON.stringify(current(), null, 2)}\n`);
    expect(existsSync(FILE), "golden.json missing: run UPDATE_GOLDEN=1 pnpm test").toBe(true);
    const frozen = JSON.parse(readFileSync(FILE, "utf8")) as { engine: number; outputs: Record<string, string> };
    const now = current() as { engine: number; outputs: Record<string, string> };
    expect(now.engine, "ENGINE_VERSION changed: regenerate goldens with UPDATE_GOLDEN=1").toBe(frozen.engine);
    // New entries may be added; existing ones must never change within an engine version.
    Object.entries(frozen.outputs).forEach(([k, v]) => expect(now.outputs[k], k).toBe(v));
  });
});
