import { describe, expect, it } from "vitest";
import type { ArtDocument, Item, Layer, ParamSetting } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const A = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const B = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const withModule = (module: string, params: Record<string, ParamSetting> = {}): ArtDocument => ({
  ...starterDocument,
  layers: [...starterDocument.layers, { id: "x", module, enabled: true, params } as Layer],
});
const added = (d: ArtDocument, hash = A): readonly Item[] => {
  const base = generate({ ...d, layers: d.layers.slice(0, -1) }, hash).scene.items.length;
  return generate(d, hash).scene.items.slice(base);
};
const points = (items: readonly Item[]) => items.flatMap((it) => (it.type === "polyline" ? it.points : []));

describe("spiral", () => {
  it("draws one continuous line, the same for the same seed and different for another", () => {
    const d = withModule("spiral");
    const items = added(d);
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("polyline");
    expect(added(d)).toEqual(items);
    expect(added(d, B)).not.toEqual(items);
  });

  it("stays inside the frame", () => {
    const d = withModule("spiral", { wobble: { value: 1 }, size: { value: 1 } });
    const f = generate(d, A).scene.frame;
    for (const [x, y] of points(added(d))) {
      expect(x).toBeGreaterThanOrEqual(f.x - 1e-9);
      expect(x).toBeLessThanOrEqual(f.x + f.w + 1e-9);
      expect(y).toBeGreaterThanOrEqual(f.y - 1e-9);
      expect(y).toBeLessThanOrEqual(f.y + f.h + 1e-9);
    }
  });

  it("in cells mode draws one spiral per cell, with fewer turns in small cells", () => {
    const d = withModule("spiral", { placement: { value: "cells" }, turns: { value: 80 } });
    const scene = generate(d, A).scene;
    const items = added(d);
    expect(items).toHaveLength(scene.cells.length);
    // A spiral of 80 turns in a small cell would be solid; the turns are capped instead.
    const longest = Math.max(...items.map((it) => (it.type === "polyline" ? it.points.length : 0)));
    expect(longest).toBeLessThan(4001);
  });

  it("wobble 0 draws an even spiral: the distance from the centre only grows", () => {
    const d = withModule("spiral", { wobble: { value: 0 } });
    const f = generate(d, A).scene.frame;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const r = points(added(d)).map(([x, y]) => Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)));
    r.slice(1).forEach((v, i) => expect(v).toBeGreaterThanOrEqual((r[i] ?? 0) - 1e-12));
  });
});

describe("ridgelines", () => {
  const ridge = (params: Record<string, ParamSetting> = {}) => withModule("ridgelines", { lines: { value: 30 }, height: { value: 6 }, ...params });

  it("without hiding, draws one full line per row, all inside the frame", () => {
    const d = ridge({ hidden: { value: false } });
    const items = added(d);
    expect(items).toHaveLength(30);
    const f = generate(d, A).scene.frame;
    for (const [x, y] of points(items)) {
      expect(x).toBeGreaterThanOrEqual(f.x - 1e-9);
      expect(x).toBeLessThanOrEqual(f.x + f.w + 1e-9);
      expect(y).toBeGreaterThanOrEqual(f.y - 1e-9);
      expect(y).toBeLessThanOrEqual(f.y + f.h + 1e-9);
    }
  });

  it("with hiding, keeps exactly the points that rise above every line in front", () => {
    // The full lines, back to front, then the points each one should show.
    const full = added(ridge({ hidden: { value: false } })).map((it) => (it.type === "polyline" ? it.points : []));
    const expected = new Set<string>();
    full.forEach((line, i) => {
      line.forEach(([x, y], j) => {
        const front = full.slice(i + 1).map((l) => l[j]?.[1] ?? Number.POSITIVE_INFINITY);
        if (front.every((fy) => y < fy)) expected.add(`${x},${y}`);
      });
    });
    const shown = points(added(ridge())).map(([x, y]) => `${x},${y}`);
    expect(new Set(shown)).toEqual(expected);
    expect(shown.length).toBe(expected.size);
  });

  it("even peaks can rise at the edges; centred peaks stay flat there", () => {
    const edgeRise = (peaks: string) => {
      const items = added(ridge({ peaks: { value: peaks }, hidden: { value: false } }));
      return Math.max(
        ...items.map((it) => {
          if (it.type !== "polyline") return 0;
          const [first] = it.points;
          const base = Math.max(...it.points.map((p) => p[1]));
          return first ? base - first[1] : 0;
        }),
      );
    };
    expect(edgeRise("centre")).toBeLessThan(1e-9);
    expect(edgeRise("even")).toBeGreaterThan(0);
  });
});

describe("cell fill shapes", () => {
  const fill = (shape: string) => withModule("cellFill", { shape: { value: shape }, fillChance: { value: 1 }, inset: { value: 0.1 } });
  const SIDES: Record<string, number> = { triangle: 3, hexagon: 6, star: 10 };

  for (const shape of ["triangle", "hexagon", "star"]) {
    it(`${shape}: closed shapes with the same cells and colors as squares, each inside its cell`, () => {
      const squares = added(fill("square"));
      const shapes = added(fill(shape));
      expect(shapes).toHaveLength(squares.length);
      const cells = generate(fill(shape), A).scene.cells;
      shapes.forEach((it, i) => {
        if (it.type !== "polyline") throw new Error("expected a polygon");
        expect(it.closed).toBe(true);
        expect(it.points).toHaveLength(SIDES[shape] ?? 0);
        expect(it.fill).toBe(squares[i]?.fill);
        const xs = it.points.map((p) => p[0]);
        const ys = it.points.map((p) => p[1]);
        const fits = cells.some((c) => Math.min(...xs) >= c.x - 1e-9 && Math.max(...xs) <= c.x + c.w + 1e-9 && Math.min(...ys) >= c.y - 1e-9 && Math.max(...ys) <= c.y + c.h + 1e-9);
        expect(fits).toBe(true);
      });
    });
  }
});
