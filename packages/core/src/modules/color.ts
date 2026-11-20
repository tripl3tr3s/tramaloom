import type { Item, PolylineItem, Scene } from "../scene.ts";

type Pt = readonly [number, number];

export const COLOR_RULES = ["contrast", "zone", "palette", "single"] as const;
export type ColorRule = (typeof COLOR_RULES)[number];

const FALLBACK = ["#f4f1ea", "#111111"] as const;

/**
 * Approximate relative luminance. Gamma 2 instead of the sRGB curve: only + and *,
 * so every JS engine agrees bit for bit.
 */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.5;
  const ch = (s: string | undefined) => {
    const c = parseInt(s ?? "0", 16) / 255;
    return c * c;
  };
  return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]);
}

/** Even-odd ray cast; comparisons and one division only, so it is engine-stable. */
function insidePolygon(poly: PolylineItem, x: number, y: number): boolean {
  const pts = poly.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (!a || !b) continue;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Bounding box in one pass (spreading huge arrays into Math.min can overflow the stack). */
export function extent(pts: readonly (readonly [number, number])[]): readonly [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

const contains = (it: Item, x: number, y: number): boolean => {
  switch (it.type) {
    case "rect":
      return x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h;
    case "circle": {
      const dx = x - it.cx;
      const dy = y - it.cy;
      return dx * dx + dy * dy <= it.r * it.r;
    }
    case "polyline":
      return it.closed === true && insidePolygon(it, x, y);
    case "dots":
      return false; // texture, never a surface to contrast against
  }
};

const bounds = (it: Item): readonly [number, number, number, number] => {
  switch (it.type) {
    case "rect":
      return [it.x, it.y, it.x + it.w, it.y + it.h];
    case "circle":
      return [it.cx - it.r, it.cy - it.r, it.cx + it.r, it.cy + it.r];
    case "polyline":
    case "dots":
      return extent(it.points);
  }
};

export type ColorLookup = (at: Pt) => string;

const BUCKETS = 64;

/**
 * Index the scene's filled items once, then answer "fill of the topmost filled
 * shape under this point, else the background" without scanning every item.
 * Same answer as a full backward scan, because each bucket keeps draw order.
 */
export function colorLookup(scene: Scene): ColorLookup {
  const bw = scene.width / BUCKETS;
  const bh = scene.height / BUCKETS;
  const cell = (v: number, size: number) => Math.min(BUCKETS - 1, Math.max(0, Math.floor(v / size)));
  // Local work buffer, filled once and never exposed.
  const grid: number[][] = Array.from({ length: BUCKETS * BUCKETS }, () => []);
  scene.items.forEach((it, idx) => {
    if (!it.fill) return;
    const [x0, y0, x1, y1] = bounds(it);
    for (let j = cell(y0, bh); j <= cell(y1, bh); j++) {
      for (let i = cell(x0, bw); i <= cell(x1, bw); i++) grid[j * BUCKETS + i]?.push(idx);
    }
  });
  return ([x, y]) => {
    const list = grid[cell(y, bh) * BUCKETS + cell(x, bw)] ?? [];
    for (let k = list.length - 1; k >= 0; k--) {
      const it = scene.items[list[k] ?? -1];
      if (it?.fill && contains(it, x, y)) return it.fill;
    }
    return scene.background;
  };
}

/**
 * The palette for a ramp (low to high, centre to rim): colors that stand apart from
 * the background, in palette order, so no band of the ramp vanishes into it.
 */
export function rampColors(scene: Scene): readonly string[] {
  const pal = scene.palette?.colors ?? [];
  const bg = luminance(scene.background);
  const apart = pal.filter((c) => Math.abs(luminance(c) - bg) >= 0.12);
  return apart.length >= 2 ? apart : pal;
}

/** One-off lookup. Prefer colorLookup when querying many points. */
export const colorUnder = (scene: Scene, at: Pt): string => colorLookup(scene)(at);

/**
 * Pick a color by rule from one uniform draw `u`, so callers always consume
 * exactly one draw whatever the rule.
 */
export function pickColor(
  scene: Scene,
  rule: ColorRule,
  u: number,
  at: Pt,
  single: string,
  under: ColorLookup = (p) => colorUnder(scene, p),
): string {
  const pal = scene.palette;
  const colors: readonly string[] = pal?.colors.length ? pal.colors : FALLBACK;
  const choose = (xs: readonly string[]) => xs[Math.floor(u * xs.length)] ?? colors[0] ?? "#000000";
  switch (rule) {
    case "single":
      return single;
    case "palette":
      return choose(colors);
    case "zone":
      return choose(pal ? (pal.zoneColors[pal.zoneAt(at[0], at[1])] ?? colors) : colors);
    case "contrast": {
      const base = luminance(under(at));
      const far = colors.filter((x) => Math.abs(luminance(x) - base) >= 0.3);
      const best = [...colors].sort((a, b) => Math.abs(luminance(b) - base) - Math.abs(luminance(a) - base));
      return far.length ? choose(far) : (best[0] ?? "#000000");
    }
  }
}
