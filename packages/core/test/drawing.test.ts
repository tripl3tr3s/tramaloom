import { describe, expect, it } from "vitest";
import { builtinPresets, checkDrawing, generate, MAX_DRAWING_ITEMS, MAX_PAINTED_CANVASES, toDrawing } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const base = { width: 1, height: 1, cornerRadius: 0, background: "#ffffff" };

describe("checkDrawing", () => {
  it("accepts every built-in preset's drawing as it is", () => {
    for (const p of builtinPresets) {
      const d = toDrawing(generate(p.doc, H).scene);
      // A structured clone, as it arrives from a worker.
      expect(checkDrawing(structuredClone(d)), p.id).toEqual(d);
    }
  });

  it("accepts CSS color forms artists use", () => {
    for (const fill of ["#abc", "#aabbccdd", "tomato", "rgb(10, 20, 30)", "rgba(10,20,30,0.5)", "hsl(200 50% 40% / 0.3)"]) {
      expect(() => checkDrawing({ ...base, items: [{ type: "circle", cx: 0, cy: 0, r: 1, fill }] }), fill).not.toThrow();
    }
  });

  it("rejects colors that could escape an attribute or load anything", () => {
    for (const fill of ['red" onload="x', "url(javascript:x)", "<script>", "#fff;", "a".repeat(40), ""]) {
      expect(() => checkDrawing({ ...base, items: [{ type: "circle", cx: 0, cy: 0, r: 1, fill }] }), fill).toThrow(/Shape 1/);
    }
    expect(() => checkDrawing({ ...base, background: 'x" y="1', items: [] })).toThrow(/background/);
  });

  it("rejects numbers that are not finite, unknown shapes and broken point lists", () => {
    const bad = [
      { type: "circle", cx: Number.NaN, cy: 0, r: 1 },
      { type: "rect", x: 0, y: 0, w: "1", h: 1 },
      { type: "polyline", points: [[0, 0], [1]] },
      { type: "dots", r: 0.01, points: [[0, Number.POSITIVE_INFINITY]] },
      { type: "image", href: "x" },
      { type: "circle", cx: 0, cy: 0, r: 1, opacity: "1" },
      { type: "circle", cx: 0, cy: 0, r: -1 },
      { type: "circle", cx: 0, cy: 0, r: 1e6 },
      { type: "circle", cx: 1e6, cy: 0, r: 1 },
      { type: "circle", cx: 0, cy: 0, r: 1, opacity: 2 },
      { type: "circle", cx: 0, cy: 0, r: 1, strokeWidth: -0.1 },
      null,
    ];
    for (const it of bad) expect(() => checkDrawing({ ...base, items: [it] }), JSON.stringify(it)).toThrow(/Shape 1/);
  });

  it("rejects a broken frame and drawings past the limits", () => {
    expect(() => checkDrawing({ ...base, width: 0, items: [] })).toThrow(/size/);
    expect(() => checkDrawing({ ...base, items: "x" })).toThrow(/items/);
    expect(() => checkDrawing("x")).toThrow(/object/);
    const many = Array.from({ length: MAX_DRAWING_ITEMS + 1 }, () => ({ type: "circle", cx: 0, cy: 0, r: 1 }));
    expect(() => checkDrawing({ ...base, items: many })).toThrow(/more than/);
  });

  it("drops fields the renderers do not use, on the drawing and on every shape", () => {
    expect(checkDrawing({ ...base, items: [], extra: "x", cells: [1] })).toEqual({ ...base, items: [] });
    const out = checkDrawing({ ...base, items: [{ type: "circle", cx: 0, cy: 0, r: 0.1, fill: "#000", hidden: "x".repeat(1000) }] });
    expect(out.items).toEqual([{ type: "circle", cx: 0, cy: 0, r: 0.1, fill: "#000" }]);
  });

  it("caps how many times the shapes may paint over the canvas", () => {
    const cover = { type: "rect", x: 0, y: 0, w: 1, h: 1, fill: "#000000", opacity: 0.5 };
    expect(() => checkDrawing({ ...base, items: Array.from({ length: MAX_PAINTED_CANVASES }, () => cover) })).not.toThrow();
    expect(() => checkDrawing({ ...base, items: Array.from({ length: MAX_PAINTED_CANVASES + 1 }, () => cover) })).toThrow(/paints the canvas/);
    // Outlines do not count: a stroked polyline paints only its line.
    const line = { type: "polyline", points: [[0, 0], [1, 1]], stroke: "#000" };
    expect(() => checkDrawing({ ...base, items: Array.from({ length: 5000 }, () => line) })).not.toThrow();
  });
});
