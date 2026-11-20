import { describe, expect, it } from "vitest";
import type { Scene } from "../src/index.ts";
import { DEFAULT_PLOTTER, emptyScene, toPlotterSVG } from "../src/index.ts";

const scene = (items: Scene["items"], over: Partial<Scene> = {}): Scene => ({ ...emptyScene(), background: "#ffffff", items, ...over });

describe("toPlotterSVG", () => {
  it("puts each color on its own pen layer, in drawing order", () => {
    const out = toPlotterSVG(
      scene([
        { type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2, fill: "#ff0000" },
        { type: "polyline", points: [[0, 0], [1, 1]], stroke: "#0000ff", strokeWidth: 0.01 },
        { type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#FF0000" },
      ]),
    );
    expect(out.layers.map((l) => [l.color, l.paths])).toEqual([["#ff0000", 2], ["#0000ff", 1]]);
    expect(out.svg).toContain('inkscape:label="1 #ff0000"');
    expect(out.svg).not.toMatch(/fill="#/);
    expect(out.penSvgs.length).toBe(2);
    expect(out.penSvgs[1]).toContain('inkscape:label="2 #0000ff"');
    expect(out.penSvgs[1]).not.toContain("#ff0000");
  });

  it("drops shapes in the background color and texture dots unless asked", () => {
    const items: Scene["items"] = [
      { type: "rect", x: 0, y: 0, w: 1, h: 1, fill: "#FFFFFF" },
      { type: "dots", points: [[0.5, 0.5]], r: 0.001, fill: "#000000" },
    ];
    expect(toPlotterSVG(scene(items)).layers).toEqual([]);
    expect(toPlotterSVG(scene(items), { ...DEFAULT_PLOTTER, includeTexture: true }).layers.length).toBe(1);
  });

  it("sizes the sheet in millimetres and fits the art inside the margin", () => {
    const wide = toPlotterSVG(scene([{ type: "polyline", points: [[0, 0], [1.5, 0]], stroke: "#000000" }], { width: 1.5, height: 1 }));
    expect([wide.widthMm, wide.heightMm]).toEqual([297, 210]);
    expect(wide.svg).toContain('width="297mm"');
    // Fit by width: (297 - 30) mm across 1.5 units, so the line is 267 mm long.
    expect(wide.layers[0]?.lengthMm).toBeCloseTo(267, 5);
  });
});
