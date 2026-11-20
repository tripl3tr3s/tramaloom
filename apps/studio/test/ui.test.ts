import { starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { initialState, reducer } from "../src/state/store.ts";
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
