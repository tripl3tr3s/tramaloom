import { describe, expect, it } from "vitest";
import type { ArtDocument, Item, Layer, ParamSetting } from "../src/index.ts";
import { generate, starterDocument } from "../src/index.ts";

const A = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

const doc = (params: Record<string, ParamSetting>, gridParams: Record<string, ParamSetting> = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers.map((l): Layer => (l.id === "grid" ? { ...l, params: { ...l.params, ...gridParams } } : l)),
    { id: "circ", module: "circuits", enabled: true, params },
  ],
});
const wiresOf = (d: ArtDocument): Extract<Item, { type: "polyline" }>[] =>
  generate(d, A).scene.items.filter((i): i is Extract<Item, { type: "polyline" }> => i.type === "polyline");

const plain = { corner: { value: "sharp" }, startTerminal: { value: "none" }, endTerminal: { value: "none" } } as const;

describe("circuits", () => {
  it("is deterministic", () => {
    const d = doc({ style: { value: "tree" } });
    expect(generate(d, A).scene.items).toEqual(generate(d, A).scene.items);
  });

  it("adding wires keeps the earlier wires unchanged", () => {
    const few = wiresOf(doc({ ...plain, wires: { value: 10 } }));
    const more = wiresOf(doc({ ...plain, wires: { value: 30 } }));
    expect(few.length).toBeGreaterThan(0);
    expect(more.slice(0, few.length)).toEqual(few);
  });

  it("walks never share a lattice node", () => {
    const pts = wiresOf(doc({ ...plain, wires: { value: 120 }, maxLength: { value: 40 } })).flatMap((w) =>
      w.points.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`),
    );
    expect(new Set(pts).size).toBe(pts.length);
  });

  it("stays inside the grid mask", () => {
    const d = doc({ ...plain, wires: { value: 80 } }, { mask: { value: "circle" }, maskAmount: { value: 0.3 }, subdivDepth: { value: 0 } });
    const cells = generate(d, A).scene.cells;
    const inside = (x: number, y: number) => cells.some((c) => x >= c.x - 1e-9 && x <= c.x + c.w + 1e-9 && y >= c.y - 1e-9 && y <= c.y + c.h + 1e-9);
    wiresOf(d).forEach((w) => w.points.forEach(([x, y]) => expect(inside(x, y)).toBe(true)));
  });

  it("tree style draws connected wires and respects coverage", () => {
    const low = wiresOf(doc({ ...plain, style: { value: "tree" }, coverage: { value: 0.1 } })).length;
    const high = wiresOf(doc({ ...plain, style: { value: "tree" }, coverage: { value: 0.9 } })).length;
    expect(high).toBeGreaterThan(low);
  });

  it("works without a grid layer", () => {
    const noGrid: ArtDocument = {
      ...starterDocument,
      layers: [
        ...starterDocument.layers.filter((l) => l.module !== "grid" && l.module !== "cellFill"),
        { id: "circ", module: "circuits", enabled: true, params: {} },
      ],
    };
    expect(wiresOf(noGrid).length).toBeGreaterThan(0);
  });
});
