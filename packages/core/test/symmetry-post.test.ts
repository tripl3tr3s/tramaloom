import { describe, expect, it } from "vitest";
import type { ArtDocument, Item, Layer, ParamSetting } from "../src/index.ts";
import type { Ctx2D } from "../src/index.ts";
import { drawScene, emptyScene, generate, starterDocument, toSVG } from "../src/index.ts";

const A = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
type Pt = readonly [number, number];

const doc = (extra: readonly Layer[], canvas: Record<string, ParamSetting> = {}): ArtDocument => ({
  ...starterDocument,
  layers: [
    ...starterDocument.layers.map((l): Layer => (l.module === "canvas" ? { ...l, params: { ...l.params, ...canvas } } : l)),
    ...extra,
  ],
});
const layer = (module: string, params: Record<string, ParamSetting> = {}): Layer => ({ id: module, module, enabled: true, params });

// Canonical key of an item's geometry and paint, rounded so float noise does not matter.
const r = (v: number) => (Math.round(v * 1e6) / 1e6).toFixed(6);
const key = (it: Item): string => {
  const paint = `${it.fill ?? ""}|${it.stroke ?? ""}|${it.strokeWidth ?? ""}`;
  switch (it.type) {
    case "rect":
      return `r${r(it.x)},${r(it.y)},${r(it.w)},${r(it.h)}|${paint}`;
    case "circle":
      return `c${r(it.cx)},${r(it.cy)},${r(it.r)}|${paint}`;
    case "polyline": {
      const pts = it.points.map(([x, y]) => `${r(x)},${r(y)}`);
      // Direction-free: a mirrored polyline may list its points in either order.
      const a = pts.join(" ");
      const b = [...pts].reverse().join(" ");
      return `p${a < b ? a : b}|${paint}`;
    }
    case "dots":
      return `d${it.points.length}|${paint}`;
  }
};
const mapItem = (it: Item, f: (p: Pt) => Pt): Item => {
  switch (it.type) {
    case "rect": {
      const [ax, ay] = f([it.x, it.y]);
      const [bx, by] = f([it.x + it.w, it.y + it.h]);
      return { ...it, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    }
    case "circle": {
      const [cx, cy] = f([it.cx, it.cy]);
      return { ...it, cx, cy };
    }
    case "polyline":
    case "dots":
      return { ...it, points: it.points.map(f) };
  }
};

type Frame = { cx: number; cy: number };
const fx = (s: Frame) => ([x, y]: Pt): Pt => [2 * s.cx - x, y];
const fy = (s: Frame) => ([x, y]: Pt): Pt => [x, 2 * s.cy - y];
const f2 = (s: Frame) => ([x, y]: Pt): Pt => [2 * s.cx - x, 2 * s.cy - y];

describe("symmetry", () => {
  const cases = [
    ["mirror-x", [fx]],
    ["mirror-y", [fy]],
    ["rotate-2", [f2]],
    ["quad", [fx, fy, f2]],
  ] as const;
  const sources = ["first", "second"] as const;

  it.each(cases.flatMap(([mode, fs]) => sources.map((source) => [mode, source, fs] as const)))(
    "%s (%s source) maps onto itself under every transform",
    (mode, source, fs) => {
      const d = doc([
        layer("tiles", { motif: { value: "mixed" } }),
        layer("circuits"),
        layer("symmetry", { mode: { value: mode }, source: { value: source } }),
      ]);
      const { items, frame } = generate(d, A).scene;
      const c = { cx: frame.x + frame.w / 2, cy: frame.y + frame.h / 2 };
      const all = new Set(items.map(key));
      expect(items.length).toBeGreaterThan(0);
      fs.forEach((mk) => items.forEach((it) => expect(all.has(key(mapItem(it, mk(c))))).toBe(true)));
    },
  );

  it("never draws a shape twice on the axis", () => {
    // 9 columns: the middle column of cells is centred on the mirror axis.
    const d: ArtDocument = {
      ...doc([layer("symmetry", { mode: { value: "quad" } })]),
    };
    const grid = d.layers.map((l): Layer =>
      l.module === "grid" ? { ...l, params: { cols: { value: 9 }, subdivDepth: { value: 0 }, fit: { value: "square" }, rows: { value: 11 } } } : l,
    );
    const items = generate({ ...d, layers: grid }, A).scene.items;
    const keys = items.map(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps each source shape next to its copies (symmetric stacking)", () => {
    const d = doc([layer("symmetry")]);
    const { items, frame } = generate(d, A).scene;
    const flip = fx({ cx: frame.x + frame.w / 2, cy: 0 });
    // Every copy directly follows its source.
    items.forEach((it, i) => {
      const next = items[i + 1];
      if (next && key(next) === key(mapItem(it, flip))) expect(i).toBeGreaterThanOrEqual(0);
    });
    const firstSource = items[0];
    expect(firstSource && items[1] && key(items[1])).toBe(firstSource && key(mapItem(firstSource, flip)));
  });

  it("rotate-4 on a square canvas maps onto itself under a quarter turn", () => {
    const d = doc([layer("tiles", { motif: { value: "triangle" } }), layer("symmetry", { mode: { value: "rotate-4" } })], {
      aspect: { value: "1:1" },
    });
    const { items, frame } = generate(d, A).scene;
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const all = new Set(items.map(key));
    items.forEach((it) => expect(all.has(key(mapItem(it, ([x, y]) => [cx - (y - cy), cy + (x - cx)])))).toBe(true));
  });

  it("leaves layers above it untouched", () => {
    const below = doc([layer("symmetry")]);
    const above = doc([layer("symmetry"), layer("insets")]);
    const a = generate(below, A).scene.items;
    expect(generate(above, A).scene.items.slice(0, a.length)).toEqual(a);
  });
});

describe("post", () => {
  it("is a no-op with grain, jitter and border off", () => {
    expect(generate(doc([layer("post", { grain: { value: 0 } })]), A).scene.items).toEqual(generate(doc([]), A).scene.items);
  });

  it("batches grain into a few dot paths, and more grain only adds specks", () => {
    const dots = (g: number) =>
      generate(doc([layer("post", { grain: { value: g } })]), A).scene.items.filter(
        (i): i is Extract<Item, { type: "dots" }> => i.type === "dots",
      );
    const less = dots(0.2);
    const more = dots(0.6);
    expect(more.length).toBeLessThanOrEqual(16);
    less.forEach((b) => {
      const m = more.find((x) => x.fill === b.fill && x.opacity === b.opacity);
      expect(m?.points.slice(0, b.points.length)).toEqual(b.points);
    });
  });

  it("keeps grain density per area the same across aspects", () => {
    const count = (aspect: string) => {
      const { items, width, height } = generate(doc([layer("post", { grain: { value: 1 } })], { aspect: { value: aspect } }), A).scene;
      const n = items.reduce((acc, i) => acc + (i.type === "dots" ? i.points.length : 0), 0);
      return n / (width * height);
    };
    expect(Math.abs(count("1:1") - count("16:9")) / count("1:1")).toBeLessThan(0.01);
  });

  it("keeps the border on the canvas even with no margin", () => {
    const d = doc([layer("post", { border: { value: true }, borderOffset: { value: 0.05 }, borderWidth: { value: 0.02 } })], {
      margin: { value: 0 },
    });
    const { items, width, height } = generate(d, A).scene;
    const b = items.find((i) => i.type === "rect" && i.stroke === "#0d1b2a");
    if (b?.type !== "rect") throw new Error("no border");
    expect(b.x - 0.01).toBeGreaterThanOrEqual(-1e-9);
    expect(b.x + b.w + 0.01).toBeLessThanOrEqual(width + 1e-9);
    expect(b.y + b.h + 0.01).toBeLessThanOrEqual(height + 1e-9);
  });

  it("jitter moves shapes without changing what they are", () => {
    const plain = generate(doc([]), A).scene.items;
    const moved = generate(doc([layer("post", { jitter: { value: 1 }, grain: { value: 0 } })]), A).scene.items;
    expect(moved.length).toBe(plain.length);
    moved.forEach((it, i) => {
      const p = plain[i];
      expect(it.type).toBe(p?.type);
      expect(it.fill).toBe(p?.fill);
      if (it.type === "rect" && p?.type === "rect") {
        expect(it.w).toBe(p.w);
        expect(Math.abs(it.x - p.x)).toBeLessThanOrEqual(0.01 + 1e-12);
      }
    });
  });

  it("renders the border and translucent grain in SVG", () => {
    const svg = toSVG(generate(doc([layer("post", { border: { value: true }, grain: { value: 0.1 } })]), A).scene);
    expect(svg).toMatch(/fill-opacity="0\.\d+"/);
    expect(svg).not.toMatch(/ opacity=/);
    expect(svg).toContain('stroke="#0d1b2a"');
  });

  it("canvas resets alpha to 1 for shapes without opacity", () => {
    const alphas: number[] = [];
    const noop = () => {};
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "",
      lineJoin: "",
      globalAlpha: 1,
      save: noop,
      restore: noop,
      scale: noop,
      clearRect: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arcTo: noop,
      arc: noop,
      rect: noop,
      fill() {
        alphas.push(this.globalAlpha);
      },
      stroke: noop,
      clip: noop,
    } satisfies Ctx2D;
    const scene = {
      ...emptyScene(),
      items: [
        { type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#000000", opacity: 0.2 },
        { type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#000000" },
        { type: "circle", cx: 0.5, cy: 0.5, r: 0.1, fill: "#000000", opacity: Number.NaN },
      ] as const,
    };
    drawScene(ctx, scene, 100, 100);
    // Background fill, then the three circles.
    expect(alphas).toEqual([1, 0.2, 1, 1]);
  });
});
