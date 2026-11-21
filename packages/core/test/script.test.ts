import { afterEach, describe, expect, it } from "vitest";
import type { ArtDocument, LayerScript, ScriptRunner } from "../src/index.ts";
import {
  breedDocuments,
  census,
  computeTraits,
  defaultRegistry,
  generate,
  hasScripts,
  layerDef,
  mutateDocument,
  resolveDocument,
  setScriptRunner,
  starterDocument,
  stream,
} from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const rngs = (tag: string) => (label: string) => stream(H, `script/${tag}/${label}`);

const script: LayerScript = {
  api: 1,
  label: "Rings",
  code: "layer({ /* never run by these tests */ })",
  params: {
    rings: { kind: "int", label: "Rings", help: "How many", min: 1, max: 20, default: 5 },
    ink: { kind: "color", label: "Ink", help: "Line color", default: "#112233" },
  },
};

const doc: ArtDocument = {
  ...starterDocument,
  layers: [...starterDocument.layers, { id: "mine", module: "script", enabled: true, params: { rings: { value: 8, vary: { kind: "range", min: 2, max: 12, dist: "uniform" } } }, script }],
  traits: [{ name: "Rings", layerId: "mine", param: "rings" }],
};

afterEach(() => setScriptRunner(null));

describe("script layers", () => {
  it("bring their own label and params", () => {
    const layer = doc.layers.at(-1);
    if (!layer) throw new Error("no layer");
    const def = layerDef(defaultRegistry, layer);
    expect(def?.label).toBe("Rings");
    expect(Object.keys(def?.params ?? {})).toEqual(["rings", "ink"]);
  });

  it("resolve their settings, traits and census without running any code", () => {
    const resolved = resolveDocument(doc, H).find((r) => r.id === "mine");
    expect(resolved?.values["ink"]).toBe("#112233");
    expect(resolved?.values["rings"]).toBeGreaterThanOrEqual(2);
    expect(resolved?.values["rings"]).toBeLessThanOrEqual(12);
    expect(computeTraits(doc, H)["Rings"]).toBe(resolved?.values["rings"]);
    expect(census(doc, [H]).total).toBe(1);
  });

  it("can be mutated and bred like any layer, keeping their script", () => {
    const m = mutateDocument(doc, rngs("m"), { amount: 1 });
    expect(m.layers.at(-1)?.script).toEqual(script);
    const b = breedDocuments(doc, doc, rngs("b"));
    expect(b.layers.at(-1)?.script).toEqual(script);
  });

  it("cannot be drawn without the sandbox's runner", () => {
    expect(hasScripts(doc)).toBe(true);
    expect(() => generate(doc, H)).toThrow(/sandbox/);
  });

  it("are drawn by the installed runner, which receives the script, the values and a seeded rng", () => {
    const seen: { script: LayerScript; rings: unknown; r: number }[] = [];
    const runner: ScriptRunner = (s, scene, v, ctx) => {
      seen.push({ script: s, rings: v["rings"], r: ctx.rng("x")() });
      return { ...scene, items: [...scene.items, { type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#000" }] };
    };
    setScriptRunner(runner);
    const a = generate(doc, H);
    const b = generate(doc, H);
    expect(a.scene.items.at(-1)).toEqual({ type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#000" });
    expect(seen[0]?.script).toBe(script);
    expect(seen[0]?.rings).toBe(a.resolved.at(-1)?.values["rings"]);
    expect(seen[0]?.r).toBe(seen[1]?.r);
  });

  it("hidden script layers need no sandbox, and documents without them are unchanged", () => {
    const hidden: ArtDocument = { ...doc, layers: doc.layers.map((l) => (l.module === "script" ? { ...l, enabled: false } : l)) };
    expect(hasScripts(hidden)).toBe(false);
    expect(generate(hidden, H).scene.items).toEqual(generate(starterDocument, H).scene.items);
  });
});
