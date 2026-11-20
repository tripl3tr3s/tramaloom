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
});
