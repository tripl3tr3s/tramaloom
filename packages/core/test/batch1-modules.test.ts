import { describe, expect, it } from "vitest";
import type { ArtDocument, CircleItem, Layer, PolylineItem } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const doc = (layer: Layer, grid: Layer["params"] = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers
      .filter((l) => l.module !== "cellFill")
      .map((l) => (l.module === "grid" ? { ...l, params: { cols: { value: 4 }, rows: { value: 4 }, fit: { value: "stretch" }, subdivDepth: { value: 0 }, gap: { value: 0 }, ...grid } } : l)),
    layer,
  ],
});
const scene = (d: ArtDocument) => generate(d, H).scene;
const own = (d: ArtDocument) => {
  const base = generate({ ...d, layers: d.layers.slice(0, -1) }, H).scene.items.length;
  return scene(d).items.slice(base);
};

describe("knot", () => {
  it("draws one turn per link end: a full 4x4 grid has 24 links, so 48 turns", () => {
    const items = own(doc({ id: "k", module: "knot", enabled: true, params: { breaks: { value: 0 }, outline: { value: false } } }));
    expect(items.length).toBe(48);
  });

  it("with outlines, draws every outline before any strand", () => {
    const items = own(doc({ id: "k", module: "knot", enabled: true, params: { breaks: { value: 0 }, outlineColor: { value: "#000000" } } })) as PolylineItem[];
    const lastOutline = items.map((i) => i.stroke).lastIndexOf("#000000");
    const firstCore = items.findIndex((i) => i.stroke !== "#000000");
    expect(lastOutline).toBeLessThan(firstCore);
  });
});

describe("pipes", () => {
  it("every opening meets an opening on the neighbouring cell, and none points off the grid", () => {
    const d = doc({ id: "p", module: "pipes", enabled: true, params: { style: { value: "flat" }, flanges: { value: false }, density: { value: 1 } } }, { cols: { value: 9 }, rows: { value: 11 } });
    const s = scene(d);
    const L = s.lattice;
    if (!L) throw new Error("no lattice");
    const onBoundary = ([x, y]: readonly [number, number]) => {
      const fx = (x - L.x) / L.cw;
      const fy = (y - L.y) / L.ch;
      const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
      return near(fx) || near(fy);
    };
    const count = new Map<string, number>();
    for (const it of own(d)) {
      if (it.type !== "polyline") continue;
      for (const p of [it.points[0], it.points[it.points.length - 1]]) {
        if (!p || !onBoundary(p)) continue;
        const k = `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    expect(count.size).toBeGreaterThan(0);
    expect([...count.values()].every((n) => n === 2)).toBe(true);
  });
});

describe("packing", () => {
  it("never overlaps two circles and keeps them inside the frame", () => {
    const d = doc({ id: "c", module: "packing", enabled: true, params: { gap: { value: 0.003 }, followMask: { value: false } } });
    const s = scene(d);
    const f = s.frame;
    const cs = own(d) as CircleItem[];
    expect(cs.length).toBeGreaterThan(20);
    for (const [i, a] of cs.entries()) {
      expect(a.cx - a.r).toBeGreaterThanOrEqual(f.x - 1e-9);
      expect(a.cy + a.r).toBeLessThanOrEqual(f.y + f.h + 1e-9);
      for (const b of cs.slice(i + 1)) expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(a.r + b.r + 0.003 - 1e-9);
    }
  });
});

describe("contour and threads", () => {
  it("keeps contour lines inside the frame", () => {
    const d = doc({ id: "c", module: "contour", enabled: true, params: { faults: { value: 2 } } });
    const f = scene(d).frame;
    const pts = own(d).flatMap((it) => (it.type === "polyline" ? it.points : []));
    expect(pts.length).toBeGreaterThan(100);
    expect(pts.every(([x, y]) => x >= f.x - 1e-9 && x <= f.x + f.w + 1e-9 && y >= f.y - 1e-9 && y <= f.y + f.h + 1e-9)).toBe(true);
  });

  it("anchors every thread on the frame edges", () => {
    const d = doc({ id: "t", module: "threads", enabled: true, params: { count: { value: 30 } } });
    const f = scene(d).frame;
    const items = own(d) as PolylineItem[];
    expect(items.length).toBe(30);
    const onEdge = ([x, y]: readonly [number, number]) =>
      Math.abs(x - f.x) < 1e-9 || Math.abs(x - f.x - f.w) < 1e-9 || Math.abs(y - f.y) < 1e-9 || Math.abs(y - f.y - f.h) < 1e-9;
    expect(items.every((t) => onEdge(t.points[0] as [number, number]) && onEdge(t.points[t.points.length - 1] as [number, number]))).toBe(true);
  });
});
