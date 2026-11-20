import { describe, expect, it } from "vitest";
import type { ArtDocument, Layer, PolylineItem } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const doc = (layer: Layer, grid: Layer["params"] = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers
      .filter((l) => l.module !== "cellFill")
      .map((l) => (l.module === "grid" ? { ...l, params: { cols: { value: 4 }, rows: { value: 5 }, fit: { value: "stretch" }, subdivDepth: { value: 0 }, ...grid } } : l)),
    layer,
  ],
});
const run = (d: ArtDocument) => {
  const base = generate({ ...d, layers: d.layers.slice(0, -1) }, H).scene.items.length;
  const scene = generate(d, H).scene;
  return { scene, own: scene.items.slice(base) };
};
const inside = (f: { x: number; y: number; w: number; h: number }, [x, y]: readonly [number, number]) =>
  x >= f.x - 1e-9 && x <= f.x + f.w + 1e-9 && y >= f.y - 1e-9 && y <= f.y + f.h + 1e-9;

describe("spirograph", () => {
  it("closes: the last point returns to the first", () => {
    const { own } = run(doc({ id: "s", module: "spiro", enabled: true, params: { ring: { value: 96 }, wheel: { value: 36 }, variety: { value: 0 } } }));
    const pts = (own[0] as PolylineItem).points;
    const [a, b] = [pts[0] as readonly [number, number], pts[pts.length - 1] as readonly [number, number]];
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeLessThan(1e-9);
  });

  it("draws one figure per cell in cell mode", () => {
    const { own } = run(doc({ id: "s", module: "spiro", enabled: true, params: { placement: { value: "cells" }, mode: { value: "harmonograph" } } }));
    expect(own.length).toBe(20);
  });
});

describe("spirograph budget", () => {
  const seg = (pts: readonly (readonly [number, number])[]) => {
    let max = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as readonly [number, number];
      const b = pts[i] as readonly [number, number];
      max = Math.max(max, Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2));
    }
    return max;
  };
  const many = { cols: { value: 30 }, rows: { value: 40 } };

  it("keeps every figure smooth and closed even with a thousand cells", () => {
    const { scene, own } = run(doc({ id: "s", module: "spiro", enabled: true, params: { placement: { value: "cells" }, ring: { value: 149 }, wheel: { value: 89 }, variety: { value: 0 } } }, many));
    expect(own.length).toBe(1200);
    const cell = Math.min(scene.cells[0]?.w ?? 1, scene.cells[0]?.h ?? 1);
    for (const it of own as PolylineItem[]) {
      const pts = it.points;
      const [a, b] = [pts[0] as readonly [number, number], pts[pts.length - 1] as readonly [number, number]];
      expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBeLessThan(1e-9);
      expect(seg(pts)).toBeLessThan(cell * 0.2);
    }
  });

  it("samples a harmonograph finely however many cells share the budget", () => {
    const { scene, own } = run(doc({ id: "s", module: "spiro", enabled: true, params: { placement: { value: "cells" }, mode: { value: "harmonograph" }, cycles: { value: 300 } } }, many));
    const cell = Math.min(scene.cells[0]?.w ?? 1, scene.cells[0]?.h ?? 1);
    for (const it of own as PolylineItem[]) expect(seg(it.points)).toBeLessThan(cell * 0.2);
  });
});

describe("attractor collapse", () => {
  it("draws a single dot when the orbit collapses to a point", () => {
    const { own } = run(doc({ id: "a", module: "attractor", enabled: true, params: { a: { value: 0 }, c: { value: 0 }, points: { value: 4000 } } }));
    const pts = own.flatMap((it) => (it.type === "dots" ? it.points : []));
    expect(pts.length).toBe(1);
  });
});

describe("phyllotaxis", () => {
  it("places the requested seeds in every cell", () => {
    const { own } = run(doc({ id: "p", module: "phyllotaxis", enabled: true, params: { placement: { value: "cells" }, seeds: { value: 30 } } }));
    expect(own.length).toBe(20 * 30);
  });
});

describe("waves and attractor", () => {
  it("keeps Chladni lines inside the frame", () => {
    const { scene, own } = run(doc({ id: "w", module: "waves", enabled: true, params: { lines: { value: 3 } } }));
    const pts = own.flatMap((it) => (it.type === "polyline" ? it.points : []));
    expect(pts.length).toBeGreaterThan(50);
    expect(pts.every((p) => inside(scene.frame, p))).toBe(true);
  });

  it("fits every attractor point inside the frame", () => {
    const { scene, own } = run(doc({ id: "a", module: "attractor", enabled: true, params: { points: { value: 5000 } } }));
    const pts = own.flatMap((it) => (it.type === "dots" ? it.points : []));
    expect(pts.length).toBe(5000);
    expect(pts.every((p) => inside(scene.frame, p))).toBe(true);
  });

  it("still draws a figure when the two Chladni modes are equal", () => {
    const { own } = run(doc({ id: "w", module: "waves", enabled: true, params: { n: { value: 4 }, m: { value: 4 }, lines: { value: 1 } } }));
    const pts = own.flatMap((it) => (it.type === "polyline" ? it.points : []));
    expect(pts.length).toBeGreaterThan(200);
  });
});
