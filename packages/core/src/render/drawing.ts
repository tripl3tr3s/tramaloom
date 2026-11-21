import type { Item, Paint, Scene } from "../scene.ts";

/** What the renderers read from a scene: enough to draw it, and plain data (no functions). */
export type Drawing = Pick<Scene, "width" | "height" | "background" | "cornerRadius" | "items">;

export const toDrawing = (scene: Drawing): Drawing => ({
  width: scene.width,
  height: scene.height,
  background: scene.background,
  cornerRadius: scene.cornerRadius,
  items: scene.items,
});

/**
 * Limits for drawings from untrusted code: generous for art, small enough that painting one
 * stays fast. Painted area is counted in canvases: 1 means shapes covering the canvas once.
 */
export const MAX_DRAWING_ITEMS = 200_000;
export const MAX_DRAWING_POINTS = 1_000_000;
export const MAX_PAINTED_CANVASES = 400;
/** Coordinates, sizes and widths, in canvas units (the short side is 1). */
const MAX_COORD = 100;

// Hex, a CSS name, or rgb()/hsl() with plain numbers: nothing that could close an attribute.
const COLOR = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,30}|(?:rgba?|hsla?)\([0-9.,%\s/+-]{1,60}\))$/;

class Invalid extends Error {}
const fail = (): never => {
  throw new Invalid();
};

const coord = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_COORD ? v : fail());
const size = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_COORD ? v : fail());
const optSize = (v: unknown): number | undefined => (v === undefined ? undefined : size(v));
const optColor = (v: unknown): string | undefined => (v === undefined ? undefined : typeof v === "string" && COLOR.test(v) ? v : fail());
const optBool = (v: unknown): boolean | undefined => (v === undefined ? undefined : typeof v === "boolean" ? v : fail());
const optOpacity = (v: unknown): number | undefined =>
  v === undefined ? undefined : typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fail();

function points(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return fail();
  return v.map((p: unknown): [number, number] => (Array.isArray(p) && p.length === 2 ? [coord(p[0]), coord(p[1])] : fail()));
}

/** Copies only the known paint fields, so nothing extra rides along. */
function paint(o: Record<string, unknown>): Paint {
  const fill = optColor(o["fill"]);
  const stroke = optColor(o["stroke"]);
  const strokeWidth = optSize(o["strokeWidth"]);
  const opacity = optOpacity(o["opacity"]);
  return {
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

/** A clean copy of a valid item, its point count and the area it paints (capped at the canvas). */
function checkItem(it: unknown, canvas: number): { readonly item: Item; readonly pts: number; readonly area: number } {
  if (typeof it !== "object" || it === null) return fail();
  const o = it as Record<string, unknown>;
  const p = paint(o);
  const capped = (a: number) => Math.min(a, canvas);
  switch (o["type"]) {
    case "rect": {
      const r = optSize(o["r"]);
      const item: Item = { type: "rect", x: coord(o["x"]), y: coord(o["y"]), w: coord(o["w"]), h: coord(o["h"]), ...(r !== undefined ? { r } : {}), ...p };
      return { item, pts: 1, area: capped(Math.abs(item.w * item.h)) };
    }
    case "circle": {
      const item: Item = { type: "circle", cx: coord(o["cx"]), cy: coord(o["cy"]), r: size(o["r"]), ...p };
      return { item, pts: 1, area: capped(Math.PI * item.r * item.r) };
    }
    case "polyline": {
      const closed = optBool(o["closed"]);
      const pts = points(o["points"]);
      const item: Item = { type: "polyline", points: pts, ...(closed !== undefined ? { closed } : {}), ...p };
      // A filled outline can cover its bounding box; a stroke only its thin line.
      return { item, pts: pts.length, area: p.fill ? capped(bboxArea(pts)) : 0 };
    }
    case "dots": {
      const texture = optBool(o["texture"]);
      const pts = points(o["points"]);
      const r = size(o["r"]);
      const item: Item = { type: "dots", points: pts, r, ...(texture !== undefined ? { texture } : {}), ...p };
      return { item, pts: pts.length, area: capped(pts.length * Math.PI * r * r) };
    }
    default:
      return fail();
  }
}

function bboxArea(pts: readonly (readonly [number, number])[]): number {
  if (pts.length === 0) return 0;
  let [x0, y0] = pts[0] as readonly [number, number];
  let [x1, y1] = [x0, y0];
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return (x1 - x0) * (y1 - y0);
}

/**
 * Checks a drawing that came from untrusted code, such as a script sandbox. Throws with a
 * readable reason; returns a clean copy with only the fields the renderers use.
 */
export function checkDrawing(input: unknown): Drawing {
  if (typeof input !== "object" || input === null) throw new Error("The drawing is not an object");
  const d = input as Record<string, unknown>;
  const { width, height, cornerRadius, background, items } = d;
  const ok = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
  if (!ok(width, MAX_COORD) || !ok(height, MAX_COORD) || width === 0 || height === 0) throw new Error("The drawing has an invalid size");
  if (!ok(cornerRadius, MAX_COORD)) throw new Error("The drawing has an invalid corner radius");
  if (typeof background !== "string" || !COLOR.test(background)) throw new Error("The drawing has an invalid background color");
  if (!Array.isArray(items)) throw new Error("The drawing has no items list");
  if (items.length > MAX_DRAWING_ITEMS) throw new Error(`The drawing has more than ${MAX_DRAWING_ITEMS.toLocaleString("en")} shapes`);
  const canvas = width * height;
  let total = 0;
  let painted = 0;
  const clean: Item[] = [];
  for (const [i, it] of items.entries()) {
    let checked: ReturnType<typeof checkItem>;
    try {
      checked = checkItem(it, canvas);
    } catch (err) {
      if (err instanceof Invalid) throw new Error(`Shape ${i + 1} is not a valid rect, circle, polyline or dots (sizes up to ${MAX_COORD}, opacity 0 to 1)`);
      throw err;
    }
    total += checked.pts;
    painted += checked.area;
    if (total > MAX_DRAWING_POINTS) throw new Error(`The drawing has more than ${MAX_DRAWING_POINTS.toLocaleString("en")} points`);
    if (painted > MAX_PAINTED_CANVASES * canvas) throw new Error(`The drawing paints the canvas over ${MAX_PAINTED_CANVASES} times; draw fewer or smaller filled shapes`);
    clean.push(checked.item);
  }
  return { width, height, cornerRadius, background, items: clean };
}
