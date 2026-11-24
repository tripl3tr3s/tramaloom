import { starterDocument } from "@tramaloom/core";
import { describe, expect, it } from "vitest";
import type { Action, StudioState } from "../src/state/store.ts";
import { freshId, initialState, reducer } from "../src/state/store.ts";

const H = "a".repeat(64);
const run = (actions: readonly Action[], s: StudioState = initialState(starterDocument, H)): StudioState =>
  actions.reduce(reducer, s);

describe("reducer", () => {
  it("records param edits and undoes/redoes them", () => {
    const edit: Action = { type: "setParam", layerId: "fill", name: "inset", setting: { value: 0.2 }, record: true };
    const s1 = run([edit]);
    expect(s1.doc.layers.find((l) => l.id === "fill")?.params.inset).toEqual({ value: 0.2 });
    const s2 = reducer(s1, { type: "undo" });
    expect(s2.doc).toBe(starterDocument);
    expect(reducer(s2, { type: "redo" }).doc).toEqual(s1.doc);
  });

  it("coalesces slider drags into one undo step via checkpoint", () => {
    const drag = (v: number): Action => ({ type: "setParam", layerId: "fill", name: "inset", setting: { value: v }, record: false });
    const s = run([{ type: "checkpoint" }, drag(0.1), drag(0.2), drag(0.3)]);
    expect(s.past.length).toBe(1);
    expect(reducer(s, { type: "undo" }).doc).toBe(starterDocument);
  });

  it("never removes, disables or moves the canvas layer", () => {
    const s = run([
      { type: "removeLayer", layerId: "canvas" },
      { type: "toggleLayer", layerId: "canvas" },
      { type: "moveLayer", layerId: "palette", dir: -1 },
    ]);
    expect(s.doc.layers[0]?.module).toBe("canvas");
    expect(s.doc.layers[0]?.enabled).toBe(true);
    expect(s.doc).toBe(starterDocument);
  });

  it("gives new and duplicated layers fresh ids", () => {
    const s = run([{ type: "addLayer", module: "cellFill" }, { type: "duplicateLayer", layerId: "fill" }]);
    const ids = s.doc.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(freshId(s.doc, "cellFill")).toBe("cellFill-3");
  });

  it("walks seeds back and forth reproducibly", () => {
    const s1 = run([{ type: "seedNext" }, { type: "seedNext" }]);
    const back = run([{ type: "seedPrev" }, { type: "seedPrev" }], s1);
    expect(back.hash).toBe(H);
    const fwd = run([{ type: "seedNext" }, { type: "seedNext" }], back);
    expect(fwd.hash).toBe(s1.hash);
    expect(fwd.seeds.length).toBe(3);
  });

  it("truncates forward seeds when a new hash is set mid-trail", () => {
    const s = run([{ type: "seedNext" }, { type: "seedNext" }, { type: "seedPrev" }, { type: "setHash", hash: "b".repeat(64) }]);
    expect(s.seeds).toHaveLength(3);
    expect(s.seeds[2]).toBe("b".repeat(64));
  });
});

describe("reducer review fixes", () => {
  it("does not create history for a checkpoint without a change", () => {
    const s = run([{ type: "checkpoint" }, { type: "checkpoint" }, { type: "checkpoint" }]);
    expect(s.past).toHaveLength(0);
  });

  it("keeps redo available after a no-op checkpoint", () => {
    const edit: Action = { type: "setParam", layerId: "fill", name: "inset", setting: { value: 0.2 }, record: true };
    const s = run([edit, { type: "undo" }, { type: "checkpoint" }]);
    expect(s.future).toHaveLength(1);
  });

  it("caps the layer count at the schema limit", () => {
    const adds: Action[] = Array.from({ length: 40 }, () => ({ type: "addLayer", module: "cellFill" }) as const);
    const s = run(adds);
    expect(s.doc.layers).toHaveLength(32);
    expect(reducer(s, { type: "duplicateLayer", layerId: "fill" }).doc.layers).toHaveLength(32);
  });

  it("hydrates from a link without creating undo or seed history", () => {
    const doc = { ...starterDocument, name: "Shared" };
    const s = run([{ type: "hydrate", doc, hash: "c".repeat(64) }]);
    expect(s.doc.name).toBe("Shared");
    expect(s.past).toHaveLength(0);
    expect(s.seeds).toEqual(["c".repeat(64)]);
  });

  it("reselects a valid layer when undo removes the selected one", () => {
    const s = run([{ type: "addLayer", module: "cellFill" }, { type: "undo" }]);
    expect(s.doc.layers.some((l) => l.id === s.selectedId)).toBe(true);
  });
});
