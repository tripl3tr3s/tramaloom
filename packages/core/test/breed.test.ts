import { describe, expect, it } from "vitest";
import type { ArtDocument } from "../src/index.ts";
import { breedDocuments, builtinPresets, starterDocument, stream } from "../src/index.ts";

const H = "a".repeat(64);
const weave = builtinPresets.find((p) => p.id === "weave")?.doc as ArtDocument;
const rng = (tag: string) => (label: string) => stream(H, `${tag}/${label}`);

describe("breedDocuments", () => {
  it("keeps the first parent at share 0 and takes every matched gene at share 1", () => {
    expect(breedDocuments(starterDocument, weave, rng("x"), { share: 0 })).toEqual(starterDocument);
    const all = breedDocuments(starterDocument, weave, rng("x"), { share: 1 });
    const fill = all.layers.find((l) => l.id === "fill");
    expect(fill?.params).toEqual(weave.layers.find((l) => l.id === "fill")?.params);
    // Weave's extra Tiles and Post layers come along when every draw picks the partner.
    expect(all.layers.map((l) => l.module)).toEqual([...starterDocument.layers.map((l) => l.module), "tiles", "post"]);
  });

  it("is deterministic for a given stream and mixes genes in between", () => {
    const a = breedDocuments(starterDocument, weave, rng("y"), { share: 0.5 });
    expect(breedDocuments(starterDocument, weave, rng("y"), { share: 0.5 })).toEqual(a);
    expect(a).not.toEqual(starterDocument);
    expect(a.name).toBe(starterDocument.name);
  });

  it("never exceeds the layer limit and keeps ids unique", () => {
    const a = breedDocuments(starterDocument, weave, rng("z"), { share: 1, maxLayers: 5 });
    expect(a.layers.length).toBe(5);
    const self = breedDocuments(weave, weave, rng("z"), { share: 1 });
    expect(new Set(self.layers.map((l) => l.id)).size).toBe(self.layers.length);
  });

  it("keeps settings locked in the first parent", () => {
    const locked: ArtDocument = {
      ...starterDocument,
      layers: starterDocument.layers.map((l) => (l.id === "fill" ? { ...l, params: { ...l.params, inset: { value: 0.33, locked: true } } } : l)),
    };
    const child = breedDocuments(locked, weave, rng("x"), { share: 1 });
    expect(child.layers.find((l) => l.id === "fill")?.params["inset"]).toEqual({ value: 0.33, locked: true });
  });

  it("pairs exact id matches before same-module fallbacks", () => {
    const maze = (id: string, style: string): ArtDocument["layers"][number] => ({ id, module: "maze", enabled: true, params: { style: { value: style } } });
    const a: ArtDocument = { version: 1, name: "a", layers: [maze("x1", "walls"), maze("x2", "walls")] };
    const b: ArtDocument = { version: 1, name: "b", layers: [maze("x2", "paths"), maze("x9", "walls")] };
    const child = breedDocuments(a, b, rng("p"), { share: 1 });
    // x2 takes b's x2 (paths); x1 falls back to the remaining x9 (walls).
    expect(child.layers.map((l) => [l.id, l.params["style"]?.value])).toEqual([["x1", "walls"], ["x2", "paths"]]);
  });

  it("adds the partner's extra layers before Symmetry and Post, which stay last", () => {
    const quilt = builtinPresets.find((p) => p.id === "quilt")?.doc as ArtDocument; // ends with symmetry, post
    const labyrinth = builtinPresets.find((p) => p.id === "labyrinth")?.doc as ArtDocument; // has halftone, maze
    const child = breedDocuments(quilt, labyrinth, rng("t"), { share: 1 });
    const modules = child.layers.map((l) => l.module);
    expect(modules.slice(-2)).toEqual(["symmetry", "post"]);
    expect(modules).toContain("maze");
    expect(modules.indexOf("maze")).toBeLessThan(modules.indexOf("symmetry"));
  });

  it("gives a partner's Post the end slot when the piece has none", () => {
    const L = (id: string, module: string) => ({ id, module, enabled: true, params: {} });
    const a: ArtDocument = { version: 1, name: "a", layers: [L("canvas", "canvas"), L("grid", "grid"), L("fill", "cellFill")] };
    const b: ArtDocument = { version: 1, name: "b", layers: [L("canvas", "canvas"), L("grid", "grid"), L("post", "post"), L("t", "tiles")] };
    const child = breedDocuments(a, b, rng("u"), { share: 1 });
    expect(child.layers.map((l) => l.module)).toEqual(["canvas", "grid", "cellFill", "tiles", "post"]);
  });
});
