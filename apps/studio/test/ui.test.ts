import { starterDocument } from "@tramaloom/core";
import { describe, expect, it } from "vitest";
import type { ParamSpec } from "@tramaloom/core";
import { MAX_FAVORITES, parseFavorites, toggleFavorite } from "../src/state/favorites.ts";
import { insertIndex, needsGrid, zones } from "../src/state/layerOrder.ts";
import { initialState, reducer } from "../src/state/store.ts";
import { groupParams, isDefaultSetting, isRelevant, weightShares, weightsForShare } from "../src/ui/params.ts";
import { SHORTCUT_GROUPS } from "../src/ui/shortcuts.ts";
import { densityCurve, keyStep, snapToStep, valueAt } from "../src/ui/vary.ts";

const H = "a".repeat(64);
const ids = (s: ReturnType<typeof initialState>): string[] => s.doc.layers.map((l) => l.id);

describe("moveLayerTo (drag reorder)", () => {
  const Ly = (id: string, module: string, enabled = true) => ({ id, module, enabled, params: {} });
  // Head: canvas, palette, grid. Middle: fill, tiles, maze. Tail: post.
  const doc = {
    version: 1 as const,
    name: "t",
    layers: [Ly("canvas", "canvas"), Ly("palette", "palette"), Ly("grid", "grid"), Ly("fill", "cellFill"), Ly("tiles", "tiles"), Ly("maze", "maze"), Ly("post", "post")],
  };
  const s0 = initialState(doc, H);

  it("moves a free layer to a new index as one undo step", () => {
    const s = reducer(s0, { type: "moveLayerTo", layerId: "maze", index: 3 });
    expect(ids(s)).toEqual(["canvas", "palette", "grid", "maze", "fill", "tiles", "post"]);
    expect(s.past.length).toBe(1);
    expect(reducer(s, { type: "undo" }).doc).toBe(doc);
  });

  it("moves down as well as up", () => {
    expect(ids(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 5 }))).toEqual(["canvas", "palette", "grid", "tiles", "maze", "fill", "post"]);
  });

  it("never moves into or out of the pinned head and tail", () => {
    expect(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 1 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 6 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "palette", index: 4 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "post", index: 4 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayer", layerId: "fill", dir: -1 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayer", layerId: "maze", dir: 1 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "nope", index: 4 })).toBe(s0);
  });

  it("never removes, hides or duplicates the pinned head; the tail can go", () => {
    expect(reducer(s0, { type: "removeLayer", layerId: "grid" })).toBe(s0);
    expect(reducer(s0, { type: "toggleLayer", layerId: "palette" })).toBe(s0);
    expect(reducer(s0, { type: "duplicateLayer", layerId: "grid" })).toBe(s0);
    expect(ids(reducer(s0, { type: "removeLayer", layerId: "post" }))).not.toContain("post");
  });

  it("adds a second grid as a free Re-grid at the end of the middle", () => {
    const s = reducer(s0, { type: "addLayer", module: "grid" });
    expect(s.doc.layers.map((l) => l.module)).toEqual(["canvas", "palette", "grid", "cellFill", "tiles", "maze", "grid", "post"]);
    expect(zones(s.doc.layers)).toEqual({ head: 3, tail: 7 });
  });

  it("promotes a stranded grid into the empty head slot", () => {
    const broken = initialState({ version: 1, name: "b", layers: [Ly("canvas", "canvas"), Ly("palette", "palette"), Ly("tiles", "tiles"), Ly("grid", "grid")] }, H);
    const s = reducer(broken, { type: "promoteLayer", layerId: "grid" });
    expect(ids(s)).toEqual(["canvas", "palette", "grid", "tiles"]);
    expect(reducer(s0, { type: "promoteLayer", layerId: "fill" })).toBe(s0);
  });
});

describe("densityCurve", () => {
  const area = (ys: readonly number[]): number => ys.reduce((a, y) => a + y, 0) / ys.length;

  it("returns n samples scaled so the peak is 1", () => {
    for (const d of ["uniform", "low", "high", "gaussian"] as const) {
      const ys = densityCurve(d, 32);
      expect(ys).toHaveLength(32);
      expect(Math.max(...ys)).toBeCloseTo(1, 6);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    }
  });

  it("is flat for uniform and centred for gaussian", () => {
    expect(new Set(densityCurve("uniform", 16)).size).toBe(1);
    const g = densityCurve("gaussian", 33);
    expect(g.indexOf(Math.max(...g))).toBe(16);
    expect(g[0]).toBeLessThan(0.1);
  });

  it("leans low for low and high for high, as mirror images", () => {
    const lo = densityCurve("low", 40);
    const hi = densityCurve("high", 40);
    expect(lo[0]).toBeGreaterThan(lo[39] as number);
    expect(hi).toEqual([...lo].reverse());
    expect(area(lo.slice(0, 20))).toBeGreaterThan(area(lo.slice(20)));
  });
});

describe("resetParam and resetLayer", () => {
  const s0 = initialState(starterDocument, H);
  const palette = (s: ReturnType<typeof initialState>) => s.doc.layers.find((l) => l.id === "palette");

  it("removes one param, so it falls back to its default, as one undo step", () => {
    const s = reducer(s0, { type: "resetParam", layerId: "palette", name: "palette" });
    expect(palette(s)?.params.palette).toBeUndefined();
    expect(s.past.length).toBe(1);
    expect(reducer(s, { type: "undo" }).doc).toBe(starterDocument);
  });

  it("is a no-op for a param already at its default", () => {
    expect(reducer(s0, { type: "resetParam", layerId: "palette", name: "nope" })).toBe(s0);
    expect(reducer(s0, { type: "resetParam", layerId: "missing", name: "palette" })).toBe(s0);
  });

  it("clears every param of a layer in one undo step", () => {
    const s = reducer(s0, { type: "resetLayer", layerId: "palette" });
    expect(palette(s)?.params).toEqual({});
    expect(s.past.length).toBe(1);
    expect(reducer(s0, { type: "resetLayer", layerId: "canvas" })).toBe(s0);
  });
});

describe("isDefaultSetting", () => {
  const spec: ParamSpec = { kind: "number", label: "Inset", default: 0.1, min: 0, max: 0.5, step: 0.01 };

  it("treats a missing setting and the default value as default", () => {
    expect(isDefaultSetting(spec, undefined)).toBe(true);
    expect(isDefaultSetting(spec, { value: 0.1 })).toBe(true);
  });

  it("treats another value, a variation or a lock as changed", () => {
    expect(isDefaultSetting(spec, { value: 0.2 })).toBe(false);
    expect(isDefaultSetting(spec, { value: 0.1, vary: { kind: "range", min: 0, max: 0.2, dist: "uniform" } })).toBe(false);
  });
});

describe("SHORTCUT_GROUPS", () => {
  it("lists every key once", () => {
    const keys = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => `${g.title}/${i.combos.map((c) => c.join("+")).join(",")}`));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k.endsWith("/?"))).toBe(true);
  });
});

describe("groupParams", () => {
  const n = (label: string, group?: string): ParamSpec => ({ kind: "bool", label, default: false, ...(group ? { group } : {}) });

  it("keeps ungrouped params first, then groups in first-appearance order", () => {
    const groups = groupParams({ a: n("A", "Shape"), b: n("B"), c: n("C", "Color"), d: n("D", "Shape") });
    expect(groups).toEqual([
      { title: null, names: ["b"] },
      { title: "Shape", names: ["a", "d"] },
      { title: "Color", names: ["c"] },
    ]);
  });

  it("returns one untitled section when nothing is grouped", () => {
    expect(groupParams({ a: n("A"), b: n("B") })).toEqual([{ title: null, names: ["a", "b"] }]);
  });
});

describe("unsaved changes", () => {
  const s0 = initialState(starterDocument, H);
  const edit = { type: "resetLayer", layerId: "palette" } as const;
  const dirty = (s: ReturnType<typeof initialState>) => s.doc !== s.savedDoc;

  it("starts clean, turns dirty on an edit and clean again when undone", () => {
    expect(dirty(s0)).toBe(false);
    const s1 = reducer(s0, edit);
    expect(dirty(s1)).toBe(true);
    expect(dirty(reducer(s1, { type: "undo" }))).toBe(false);
  });

  it("is clean after markSaved and after opening a document", () => {
    const s1 = reducer(reducer(s0, edit), { type: "markSaved" });
    expect(dirty(s1)).toBe(false);
    expect(dirty(reducer(s1, { type: "undo" }))).toBe(true);
    const opened = reducer(reducer(s0, edit), { type: "loadDoc", doc: starterDocument });
    expect(dirty(opened)).toBe(false);
  });

  it("marks the doc that was saved, not a later edit", () => {
    const s1 = reducer(s0, edit);
    const s2 = reducer(reducer(s1, { type: "rename", name: "Later" }), { type: "markSaved", doc: s1.doc });
    expect(s2.savedDoc).toBe(s1.doc);
    expect(s2.doc !== s2.savedDoc).toBe(true);
  });

  it("treats a rename as a change", () => {
    expect(dirty(reducer(s0, { type: "rename", name: "Other" }))).toBe(true);
  });
});

describe("favorites", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);

  it("stars newest first and unstars", () => {
    const one = toggleFavorite([], a);
    const two = toggleFavorite(one, b);
    expect(two).toEqual([b, a]);
    expect(toggleFavorite(two, a)).toEqual([b]);
  });

  it("caps the list, dropping the oldest", () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => i.toString(16).padStart(64, "0"));
    const next = toggleFavorite(full, a);
    expect(next.length).toBe(MAX_FAVORITES);
    expect(next[0]).toBe(a);
    expect(next).not.toContain(full[full.length - 1]);
  });

  it("keeps only valid, distinct hashes from storage", () => {
    expect(parseFavorites([a, a, b])).toEqual([a, b]);
    expect(parseFavorites([a, "nope", 7])).toEqual([a]);
    expect(parseFavorites({ a })).toEqual([]);
  });
});

describe("weightShares", () => {
  it("turns weights into chances that sum to 1", () => {
    expect(weightShares(["a", "b", "c"], { a: 3, b: 1 })).toEqual([0.75, 0.25, 0]);
  });

  it("is all zero when nothing can be drawn", () => {
    expect(weightShares(["a", "b"], { a: 0 })).toEqual([0, 0]);
  });
});

describe("layer order help", () => {
  const L = (id: string, module: string, enabled = true) => ({ id, module, enabled, params: {} });
  const doc = (...layers: ReturnType<typeof L>[]) => ({ version: 1 as const, name: "t", layers });

  it("adds grid and palette above drawing layers, post and symmetry at the end", () => {
    const d = doc(L("canvas", "canvas"), L("tiles", "tiles"), L("post", "post"));
    expect(insertIndex(d.layers, "grid")).toBe(1);
    expect(insertIndex(d.layers, "palette")).toBe(1);
    expect(insertIndex(d.layers, "maze")).toBe(2);
    expect(insertIndex(d.layers, "symmetry")).toBe(2);
    // Post already fills its tail slot, so a second one is a free layer at the middle's end.
    expect(insertIndex(d.layers, "post")).toBe(2);
    expect(insertIndex(doc(L("canvas", "canvas"), L("tiles", "tiles")).layers, "post")).toBe(2);
  });

  it("flags drawing layers with no enabled grid above them", () => {
    const d = doc(L("canvas", "canvas"), L("tiles", "tiles"), L("grid", "grid"), L("maze", "maze"), L("flow", "flow"));
    expect(needsGrid(d.layers, 1)).toBe(true);
    expect(needsGrid(d.layers, 3)).toBe(false);
    // Flow draws without a grid (the grid only adds its mask).
    expect(needsGrid(doc(L("canvas", "canvas"), L("flow", "flow")).layers, 1)).toBe(false);
    expect(needsGrid(doc(L("canvas", "canvas"), L("grid", "grid", false), L("hatch", "hatch")).layers, 2)).toBe(true);
  });

  it("addLayer puts a new grid above the drawing layers", () => {
    const s0 = initialState({ version: 1, name: "t", layers: [L("canvas", "canvas"), L("tiles", "tiles")] }, H);
    const s = reducer(s0, { type: "addLayer", module: "grid" });
    expect(s.doc.layers.map((l) => l.module)).toEqual(["canvas", "grid", "tiles"]);
    expect(s.selectedId).toBe(s.doc.layers[1]?.id);
  });
});

describe("isRelevant", () => {
  const params: Record<string, ParamSpec> = {
    mode: { kind: "enum", label: "Mode", options: ["a", "b"], default: "a" },
    onlyB: { kind: "int", label: "Only b", min: 0, max: 9, default: 1, showIf: { param: "mode", is: ["b"] } },
    notA: { kind: "int", label: "Not a", min: 0, max: 9, default: 1, showIf: { param: "mode", not: ["a"] } },
  };
  const spec = (k: string) => params[k] as ParamSpec;

  it("follows the fixed value of the controlling setting, or its default", () => {
    expect(isRelevant(spec("onlyB"), params, {})).toBe(false);
    expect(isRelevant(spec("onlyB"), params, { mode: { value: "b" } })).toBe(true);
    expect(isRelevant(spec("notA"), params, { mode: { value: "a" } })).toBe(false);
    expect(isRelevant(spec("mode"), params, {})).toBe(true);
  });

  it("stays visible while the controlling setting varies, but not when it is locked", () => {
    const vary = { kind: "weights" as const, weights: { a: 1, b: 1 } };
    expect(isRelevant(spec("onlyB"), params, { mode: { value: "a", vary } })).toBe(true);
    expect(isRelevant(spec("onlyB"), params, { mode: { value: "a", vary, locked: true } })).toBe(false);
  });
});

describe("touch sliders", () => {
  it("snaps to the step grid from min, without float dust, inside the range", () => {
    expect(snapToStep(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(0.0123, 0, 0.02, 0.0005)).toBe(0.0125);
    expect(snapToStep(7, 1, 64, 1)).toBe(7);
    expect(snapToStep(99, 1, 64, 1)).toBe(64);
    expect(snapToStep(-3, 1, 64, 1)).toBe(1);
    expect(snapToStep(2.4, 1, 64, 2)).toBe(3);
  });

  it("maps a track fraction to a value, clamped at both ends", () => {
    expect(valueAt(0, 1, 64, 1)).toBe(1);
    expect(valueAt(1, 1, 64, 1)).toBe(64);
    expect(valueAt(0.5, 0, 100, 1)).toBe(50);
    expect(valueAt(1.5, 0, 1, 0.01)).toBe(1);
    expect(valueAt(-1, 0, 1, 0.01)).toBe(0);
  });

  it("moves with the keys a native range input handles, and ignores the rest", () => {
    expect(keyStep("ArrowRight", 5, 0, 10, 1)).toBe(6);
    expect(keyStep("ArrowDown", 5, 0, 10, 1)).toBe(4);
    expect(keyStep("PageUp", 0.5, 0, 1, 0.01)).toBe(0.6);
    expect(keyStep("Home", 5, 0, 10, 1)).toBe(0);
    expect(keyStep("End", 5, 0, 10, 1)).toBe(10);
    expect(keyStep("ArrowRight", 10, 0, 10, 1)).toBe(10);
    expect(keyStep("r", 5, 0, 10, 1)).toBeNull();
  });
});

describe("weightsForShare (dragging a chance bar)", () => {
  const opts = ["a", "b", "c"];
  const shareOf = (w: Readonly<Record<string, number>>, o: string) => weightShares(opts, w)[opts.indexOf(o)] ?? 0;

  it("gives the dragged option the share and keeps the others' proportions", () => {
    const w = weightsForShare(opts, { a: 1, b: 1, c: 2 }, "a", 0.4);
    expect(w).toEqual({ a: 40, b: 20, c: 40 });
    expect(shareOf(w, "a")).toBeCloseTo(0.4);
  });

  it("writes whole numbers summing to about 100", () => {
    const w = weightsForShare(opts, { a: 3, b: 7, c: 11 }, "b", 0.33);
    for (const v of Object.values(w)) expect(Number.isInteger(v)).toBe(true);
    const total = Object.values(w).reduce((x, y) => x + y, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(2);
    expect(shareOf(w, "b")).toBeCloseTo(0.33, 1);
  });

  it("splits the rest evenly when every other option was zero", () => {
    expect(weightsForShare(opts, { a: 5, b: 0, c: 0 }, "a", 0.5)).toEqual({ a: 50, b: 25, c: 25 });
  });

  it("dragging to 100% leaves the others at zero, and to 0% keeps them", () => {
    expect(weightsForShare(opts, { a: 1, b: 1, c: 1 }, "a", 1)).toEqual({ a: 100, b: 0, c: 0 });
    expect(weightsForShare(opts, { a: 1, b: 1, c: 2 }, "a", 0)).toEqual({ a: 0, b: 33, c: 67 });
  });

  it("never silently drops an option that still has a chance", () => {
    const w = weightsForShare(opts, { a: 1, b: 1, c: 1000 }, "a", 0.5);
    expect(w.b).toBeGreaterThanOrEqual(1);
  });

  it("leaves a single option, or an unknown one, alone", () => {
    expect(weightsForShare(["a"], { a: 3 }, "a", 0.2)).toEqual({ a: 3 });
    expect(weightsForShare(opts, { a: 1, b: 1, c: 1 }, "z", 0.2)).toEqual({ a: 1, b: 1, c: 1 });
  });

  it("keeps weights of options outside the list untouched", () => {
    expect(weightsForShare(["a", "b"], { a: 1, b: 1, old: 4 }, "a", 0.75)).toEqual({ a: 75, b: 25, old: 4 });
  });
});
