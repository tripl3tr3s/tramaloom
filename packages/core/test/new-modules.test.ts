import { describe, expect, it } from "vitest";
import type { ArtDocument, Layer } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const doc = (layer: Layer, grid: Layer["params"] = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers
      .filter((l) => l.module !== "cellFill")
      .map((l) => (l.module === "grid" ? { ...l, params: { cols: { value: 8 }, rows: { value: 10 }, fit: { value: "stretch" }, subdivDepth: { value: 0 }, ...grid } } : l)),
    layer,
  ],
});
const items = (d: ArtDocument) => generate(d, H).scene.items;

describe("maze", () => {
  it("is a spanning tree without braiding: one corridor fewer than cells", () => {
    const d = doc({ id: "m", module: "maze", enabled: true, params: { style: { value: "paths" } } });
    const corridors = items(d).filter((it) => it.type === "polyline");
    expect(corridors.length).toBe(8 * 10 - 1);
  });

  it("braiding only adds corridors", () => {
    const tree = doc({ id: "m", module: "maze", enabled: true, params: { style: { value: "paths" } } });
    const braided = doc({ id: "m", module: "maze", enabled: true, params: { style: { value: "paths" }, braid: { value: 1 } } });
    expect(items(braided).length).toBeGreaterThan(items(tree).length);
  });
});

describe("halftone", () => {
  it("draws one dot per cell, never bigger than the largest size", () => {
    const d = doc({ id: "h", module: "halftone", enabled: true, params: { maxSize: { value: 0.9 } } });
    const s = generate(d, H).scene;
    const dots = s.items.slice(-s.cells.length);
    expect(dots.length).toBe(s.cells.length);
    dots.forEach((it, i) => {
      const c = s.cells[i];
      expect(it.type === "circle" && c !== undefined && it.r * 2 <= 0.9 * Math.min(c.w, c.h) + 1e-9).toBe(true);
    });
  });
});

describe("hatch", () => {
  it("draws the requested number of lines per cell, inside the cell", () => {
    const d = doc({ id: "x", module: "hatch", enabled: true, params: { direction: { value: "horizontal" }, lines: { value: 5 }, inset: { value: 0 } } });
    const lines = items(d).filter((it) => it.type === "polyline");
    expect(lines.length).toBe(8 * 10 * 5);
  });
});

describe("flow", () => {
  it("keeps every streamline inside the frame", () => {
    const d = doc({ id: "f", module: "flow", enabled: true, params: { followMask: { value: false } } });
    const s = generate(d, H).scene;
    const f = s.frame;
    const pts = s.items.flatMap((it) => (it.type === "polyline" ? it.points : []));
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(([x, y]) => x >= f.x - 1e-9 && y >= f.y - 1e-9 && x <= f.x + f.w + 1e-9 && y <= f.y + f.h + 1e-9)).toBe(true);
  });
});
