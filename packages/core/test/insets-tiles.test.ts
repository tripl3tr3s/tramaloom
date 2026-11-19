import { describe, expect, it } from "vitest";
import type { ArtDocument, Item, Layer, ParamSetting } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const A = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

const withModule = (module: string, params: Record<string, ParamSetting>, grid: Record<string, ParamSetting> = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers.map((l): Layer => (l.id === "grid" ? { ...l, params: { ...l.params, ...grid } } : l)),
    { id: "x", module, enabled: true, params },
  ],
});
const added = (d: ArtDocument): readonly Item[] => {
  const base = generate({ ...d, layers: d.layers.slice(0, -1) }, A).scene.items.length;
  return generate(d, A).scene.items.slice(base);
};
const key = (it: Item) => JSON.stringify(it);

describe("insets", () => {
  it("is deterministic and draws nothing at chance 0", () => {
    const d = withModule("insets", {});
    expect(added(d)).toEqual(added(d));
    expect(added(withModule("insets", { chance: { value: 0 } }))).toEqual([]);
  });

  it("keeps per-cell output stable when chance changes", () => {
    const all = new Set(added(withModule("insets", { chance: { value: 1 } })).map(key));
    const some = added(withModule("insets", { chance: { value: 0.3 } }));
    expect(some.length).toBeGreaterThan(0);
    some.forEach((it) => expect(all.has(key(it))).toBe(true));
  });

  it("keeps rings inside their cell", () => {
    const d = withModule("insets", { chance: { value: 1 }, rings: { value: 8 } });
    const cells = generate(d, A).scene.cells;
    const inCell = (x: number, y: number) => cells.some((c) => x >= c.x - 1e-9 && x <= c.x + c.w + 1e-9 && y >= c.y - 1e-9 && y <= c.y + c.h + 1e-9);
    added(d).forEach((it) => {
      if (it.type === "rect") expect(inCell(it.x, it.y) && inCell(it.x + it.w, it.y + it.h)).toBe(true);
    });
  });
});

describe("tiles", () => {
  it("keeps per-cell output stable when chance changes (fixed draws per cell)", () => {
    const all = new Set(added(withModule("tiles", { chance: { value: 1 } })).map(key));
    const some = added(withModule("tiles", { chance: { value: 0.4 } }));
    some.forEach((it) => expect(all.has(key(it))).toBe(true));
  });

  it.each([1, 2, 3, 5])("arcs with %i line(s) connect across neighbouring cells", (lines) => {
    const d = withModule(
      "tiles",
      { lines: { value: lines } },
      { subdivDepth: { value: 0 }, gap: { value: 0 }, mask: { value: "none" }, fit: { value: "square" }, cols: { value: 8 }, rows: { value: 10 } },
    );
    const { frame } = generate(d, A).scene;
    const cells = generate(d, A).scene.cells;
    const minX = Math.min(...cells.map((c) => c.x));
    const maxX = Math.max(...cells.map((c) => c.x + c.w));
    const minY = Math.min(...cells.map((c) => c.y));
    const maxY = Math.max(...cells.map((c) => c.y + c.h));
    expect(frame.w).toBeGreaterThan(0);
    const ends = added(d).flatMap((it) => (it.type === "polyline" ? [it.points[0], it.points[it.points.length - 1]] : []));
    const k = (p: readonly [number, number] | undefined) => (p ? `${p[0].toFixed(6)},${p[1].toFixed(6)}` : "");
    const counts = new Map<string, number>();
    ends.forEach((p) => counts.set(k(p), (counts.get(k(p)) ?? 0) + 1));
    const onBorder = (p: readonly [number, number]) =>
      Math.abs(p[0] - minX) < 1e-9 || Math.abs(p[0] - maxX) < 1e-9 || Math.abs(p[1] - minY) < 1e-9 || Math.abs(p[1] - maxY) < 1e-9;
    ends.forEach((p) => {
      if (p && !onBorder(p)) expect(counts.get(k(p)), k(p)).toBe(2);
    });
  });

  it.each([
    ["gap", { gap: { value: 0.004 }, subdivDepth: { value: 0 }, cols: { value: 40 } }],
    ["subdivision", { subdivDepth: { value: 2 }, splitChance: { value: 0.5 } }],
  ] as const)("checker parity matches grid position with %s", (_, grid) => {
    const d = withModule("tiles", { motif: { value: "diagonal" }, rotation: { value: "checker" }, chance: { value: 1 } }, grid);
    const { cells, lattice } = generate(d, A).scene;
    const lines = added(d);
    expect(lattice).not.toBeNull();
    expect(lines.length).toBe(cells.length);
    cells.forEach((c, i) => {
      const it = lines[i];
      if (it?.type !== "polyline" || !lattice) throw new Error("expected a diagonal");
      const k = 1 << c.depth;
      const ix = Math.floor((c.x + c.w / 2 - lattice.x) / (lattice.cw / k));
      const iy = Math.floor((c.y + c.h / 2 - lattice.y) / (lattice.ch / k));
      // Parity 0 runs top-left to bottom-right, parity 1 top-right to bottom-left.
      const start = it.points[0];
      expect(start?.[0] === c.x ? 0 : 1).toBe((ix + iy) & 1);
    });
  });

  it("thick multi-line arcs never overlap opposite arcs", () => {
    const d = withModule("tiles", { lines: { value: 5 }, lineWidth: { value: 0.3 } }, { subdivDepth: { value: 0 } });
    const arcs = added(d).filter((it) => it.type === "polyline");
    const widths = new Set(arcs.map((it) => it.strokeWidth));
    expect(widths.size).toBeGreaterThan(0);
    const cellSize = generate(d, A).scene.cells[0]?.w ?? 1;
    // Neighbouring strokes are at least 1.6 widths apart (centre to centre).
    widths.forEach((w) => expect((w ?? 0) / cellSize).toBeLessThan(0.36 / 4 / 1.5));
  });

  it("closed motifs are filled polygons", () => {
    added(withModule("tiles", { motif: { value: "triangle" } })).forEach((it) => {
      expect(it.type === "polyline" && it.closed && typeof it.fill === "string").toBe(true);
    });
  });
});
