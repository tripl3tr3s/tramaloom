import type { ArtDocument } from "@gridloom/core";
import { seedSeries, starterDocument, stepHash } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { parseLibraryFile } from "../src/state/library.ts";
import { parseDocument } from "../src/state/schema.ts";
import { initialState, reducer } from "../src/state/store.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const roundTrip = (d: unknown) => parseDocument(JSON.parse(JSON.stringify(d)));

describe("traits in the document schema", () => {
  it("accepts the starter traits and documents without traits", () => {
    expect(roundTrip(starterDocument)).toEqual(starterDocument);
    const { traits: _t, ...bare } = starterDocument;
    expect(roundTrip(bare)).toEqual(bare);
  });

  it.each([
    ["duplicate names", [{ name: "A", layerId: "grid", param: "cols" }, { name: "A", layerId: "palette", param: "palette" }]],
    ["empty name", [{ name: "  ", layerId: "grid", param: "cols" }]],
    ["bad layer id", [{ name: "A", layerId: "../x", param: "cols" }]],
    ["infinite bin", [{ name: "A", layerId: "grid", param: "cols", bins: [{ label: "x", upTo: "Infinity" }] }]],
    ["descending bins", [{ name: "A", layerId: "grid", param: "cols", bins: [{ label: "x", upTo: 10 }, { label: "y", upTo: 5 }, { label: "z" }] }]],
    ["catch-all in the middle", [{ name: "A", layerId: "grid", param: "cols", bins: [{ label: "x" }, { label: "y", upTo: 5 }] }]],
    ["no catch-all", [{ name: "A", layerId: "grid", param: "cols", bins: [{ label: "x", upTo: 5 }] }]],
    ["odd param name", [{ name: "A", layerId: "grid", param: "__proto__.x" }]],
    ["too many traits", Array.from({ length: 17 }, (_, i) => ({ name: `T${i}`, layerId: "grid", param: "cols" }))],
  ])("rejects %s", (_, traits) => {
    expect(roundTrip({ ...starterDocument, traits })).toBeNull();
  });
});

describe("setTraits", () => {
  it("is one undoable step and removes the field when empty", () => {
    const s0 = initialState(starterDocument, H);
    const s1 = reducer(s0, { type: "setTraits", traits: [] });
    expect("traits" in s1.doc).toBe(false);
    expect(reducer(s1, { type: "undo" }).doc).toBe(starterDocument);
  });
});

describe("library file", () => {
  const preset = { id: "abc", name: "Mine", doc: starterDocument as ArtDocument, hash: H, createdAt: 1 };

  it("round-trips valid presets and skips invalid ones", () => {
    const file = { format: "gridloom-library", version: 1, presets: [preset, { ...preset, id: "../bad" }] };
    const parsed = parseLibraryFile(JSON.parse(JSON.stringify(file)));
    expect(parsed?.presets).toEqual([preset]);
    expect(parsed?.skipped).toBe(1);
  });

  it("rejects files that are not library files", () => {
    expect(parseLibraryFile({ presets: [] })).toBeNull();
    expect(parseLibraryFile(starterDocument)).toBeNull();
  });
});

describe("seedSeries", () => {
  it("starts at the root and is reproducible", () => {
    expect(seedSeries(H, 3)).toEqual([H, stepHash(H, 1), stepHash(H, 2)]);
    expect(seedSeries(H, 0)).toEqual([]);
  });
});
