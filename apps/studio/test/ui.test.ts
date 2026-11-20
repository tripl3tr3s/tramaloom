import { starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import type { ParamSpec } from "@gridloom/core";
import { MAX_FAVORITES, parseFavorites, toggleFavorite } from "../src/state/favorites.ts";
import { initialState, reducer } from "../src/state/store.ts";
import { groupParams, isDefaultSetting, weightShares } from "../src/ui/params.ts";
import { SHORTCUT_GROUPS } from "../src/ui/shortcuts.ts";
import { densityCurve } from "../src/ui/vary.ts";

const H = "a".repeat(64);
const ids = (s: ReturnType<typeof initialState>): string[] => s.doc.layers.map((l) => l.id);

describe("moveLayerTo (drag reorder)", () => {
  const s0 = initialState(starterDocument, H);

  it("moves a layer to a new index as one undo step", () => {
    const s = reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 1 });
    expect(ids(s)).toEqual(["canvas", "fill", "palette", "grid"]);
    expect(s.past.length).toBe(1);
    expect(reducer(s, { type: "undo" }).doc).toBe(starterDocument);
  });

  it("moves down as well as up", () => {
    const s = reducer(s0, { type: "moveLayerTo", layerId: "palette", index: 3 });
    expect(ids(s)).toEqual(["canvas", "grid", "fill", "palette"]);
  });

  it("keeps the canvas first and ignores out-of-range or no-op moves", () => {
    expect(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 0 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "canvas", index: 2 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 9 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "fill", index: 3 })).toBe(s0);
    expect(reducer(s0, { type: "moveLayerTo", layerId: "nope", index: 1 })).toBe(s0);
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
