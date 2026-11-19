import type { ArtDocument } from "@gridloom/core";
import { builtinPresets, mutateDocument, starterDocument, stepHash, stream } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { parseUserPreset } from "../src/state/library.ts";
import { parseDocument } from "../src/state/schema.ts";
import { initialState, reducer } from "../src/state/store.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

describe("built-in presets", () => {
  it.each(builtinPresets.map((p) => [p.id, p] as const))("%s is a valid document with a valid hash", (_, p) => {
    expect(parseDocument(JSON.parse(JSON.stringify(p.doc)))).toEqual(p.doc);
    expect(p.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("have unique ids", () => {
    expect(new Set(builtinPresets.map((p) => p.id)).size).toBe(builtinPresets.length);
  });
});

describe("mutations stay loadable", () => {
  it("every mutation of every preset passes the document schema (so it survives a share link)", () => {
    builtinPresets.forEach((p) => {
      Array.from({ length: 25 }, (_, i) => mutateDocument(p.doc, (l) => stream(stepHash(H, i), l), { amount: 1 })).forEach((m) => {
        expect(parseDocument(JSON.parse(JSON.stringify(m)))).not.toBeNull();
      });
    });
  });
});

describe("adopt action", () => {
  const other: ArtDocument = { ...starterDocument, name: "Other" };

  it("records one undo step and a seed step when the hash changes", () => {
    const s0 = initialState(starterDocument, H);
    const s1 = reducer(s0, { type: "adopt", doc: other, hash: stepHash(H, 3) });
    expect(s1.doc).toBe(other);
    expect(s1.past).toEqual([{ doc: starterDocument, hash: H }]);
    expect(s1.seeds).toEqual([H, stepHash(H, 3)]);
  });

  it("undo and redo bring back the same picture (doc and seed together)", () => {
    const s0 = initialState(starterDocument, H);
    const s1 = reducer(s0, { type: "adopt", doc: other, hash: stepHash(H, 3) });
    const undone = reducer(s1, { type: "undo" });
    expect(undone.doc).toBe(starterDocument);
    expect(undone.hash).toBe(H);
    const redone = reducer(undone, { type: "redo" });
    expect(redone.doc).toBe(other);
    expect(redone.hash).toBe(stepHash(H, 3));
  });

  it("undoing an ordinary edit never rewinds a later reroll", () => {
    const s0 = initialState(starterDocument, H);
    const s1 = reducer(s0, { type: "setParam", layerId: "grid", name: "cols", setting: { value: 9 }, record: true });
    const s2 = reducer(s1, { type: "setHash", hash: stepHash(H, 9) });
    const undone = reducer(s2, { type: "undo" });
    expect(undone.hash).toBe(stepHash(H, 9));
    expect(undone.doc).toBe(starterDocument);
  });

  it("ignores an adopt that changes nothing, even with a new object", () => {
    const s0 = initialState(starterDocument, H);
    expect(reducer(s0, { type: "adopt", doc: JSON.parse(JSON.stringify(starterDocument)), hash: H })).toBe(s0);
  });

  it("keeps the seed trail when the hash is unchanged", () => {
    const s1 = reducer(initialState(starterDocument, H), { type: "adopt", doc: other, hash: H });
    expect(s1.seeds).toEqual([H]);
    expect(s1.past.length).toBe(1);
  });

  it("keeps the selection on an existing layer", () => {
    const s0 = { ...initialState(starterDocument, H), selectedId: "gone" };
    const s1 = reducer(s0, { type: "adopt", doc: other, hash: H });
    expect(other.layers.some((l) => l.id === s1.selectedId)).toBe(true);
  });
});

describe("parseUserPreset", () => {
  const good = { id: "abc_123", name: "Mine", doc: starterDocument, hash: H, createdAt: 1 };

  it("accepts a well-formed record", () => {
    expect(parseUserPreset(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it.each([
    ["bad id", { ...good, id: "../../x" }],
    ["bad hash", { ...good, hash: "xyz" }],
    ["bad doc", { ...good, doc: { ...starterDocument, layers: [{ id: "x", module: "constructor", enabled: true, params: {} }] } }],
    ["long name", { ...good, name: "n".repeat(101) }],
    ["not an object", "hello"],
  ])("rejects %s", (_, rec) => {
    expect(parseUserPreset(rec)).toBeNull();
  });
});
