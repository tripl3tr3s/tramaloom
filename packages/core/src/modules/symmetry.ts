import type { Item } from "../scene.ts";
import { extent } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
type Xf = (p: Pt) => Pt;

/** Apply a point transform to an item. Rects stay axis-aligned under every transform used here. */
export function transformItem(it: Item, f: Xf): Item {
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
}

function center(it: Item): Pt {
  switch (it.type) {
    case "rect":
      return [it.x + it.w / 2, it.y + it.h / 2];
    case "circle":
      return [it.cx, it.cy];
    case "polyline":
    case "dots": {
      const [x0, y0, x1, y1] = extent(it.points);
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    }
  }
}

const EPS = 1e-9;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const samePts = (a: readonly Pt[], b: readonly Pt[]) => a.length === b.length && a.every((p, i) => near(p[0], b[i]?.[0] ?? NaN) && near(p[1], b[i]?.[1] ?? NaN));

/** True when a copy lands on its source (a shape centred on the axis); drawing it again would double any transparency. */
function coincides(a: Item, b: Item): boolean {
  if (a.type === "rect" && b.type === "rect") return near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
  if (a.type === "circle" && b.type === "circle") return near(a.cx, b.cx) && near(a.cy, b.cy);
  if ((a.type === "polyline" && b.type === "polyline") || (a.type === "dots" && b.type === "dots")) {
    return samePts(a.points, b.points) || samePts(a.points, [...b.points].reverse());
  }
  return false;
}

export const symmetryModule = defineModule({
  id: "symmetry",
  label: "Symmetry",
  description:
    "Rebuilds the shapes drawn below it from one half or quarter, mirrored or rotated. Layers above stay free and still see the original grid.",
  params: {
    mode: {
      kind: "enum",
      label: "Mode",
      options: ["mirror-x", "mirror-y", "quad", "rotate-2", "rotate-4"],
      default: "mirror-x",
      help: "mirror-x: left/right; quad: both axes; rotate-4 needs a 1:1 canvas, other aspects stretch the copies",
    },
    source: {
      kind: "enum",
      label: "Source",
      options: ["first", "second"],
      default: "first",
      help: "Which half (left/top) or quarter is kept and copied",
    },
  },
  apply(scene, v) {
    const { frame } = scene;
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    const second = v.source === "second";
    // Keep side: first = left/top (coordinate below the axis), second = right/bottom.
    const keepX = (x: number) => (second ? x >= cx - EPS : x <= cx + EPS);
    const keepY = (y: number) => (second ? y >= cy - EPS : y <= cy + EPS);

    const flipX: Xf = ([x, y]) => [2 * cx - x, y];
    const flipY: Xf = ([x, y]) => [x, 2 * cy - y];
    const turn2: Xf = ([x, y]) => [2 * cx - x, 2 * cy - y];
    // Quarter turn clockwise about the frame center. Coordinates are scaled so a
    // non-square frame maps onto itself (a quarter turn of a rectangle is a stretch).
    const sx = frame.w / 2;
    const sy = frame.h / 2;
    const turn4: Xf = ([x, y]) => [cx - ((y - cy) / sy) * sx, cy + ((x - cx) / sx) * sy];

    const [keep, copies] = ((): readonly [(p: Pt) => boolean, readonly Xf[]] => {
      switch (v.mode) {
        case "mirror-x":
          return [([x]) => keepX(x), [flipX]];
        case "mirror-y":
          return [([, y]) => keepY(y), [flipY]];
        case "quad":
          return [([x, y]) => keepX(x) && keepY(y), [flipX, flipY, turn2]];
        case "rotate-2":
          return [([x]) => keepX(x), [turn2]];
        case "rotate-4":
          return [([x, y]) => keepX(x) && keepY(y), [turn4, turn2, (p) => turn4(turn2(p))]];
      }
    })();

    // Each source shape is followed by its own copies, so overlapping shapes stack
    // the same way on every side and the result is symmetric in draw order too.
    const items = scene.items
      .filter((it) => keep(center(it)))
      .flatMap((it) => {
        const extra = copies.map((f) => transformItem(it, f)).filter((c) => !coincides(c, it));
        // Two copies may also land on each other (centre shapes under quad / rotate-4).
        const unique = extra.filter((c, i) => !extra.slice(0, i).some((d) => coincides(c, d)));
        return [it, ...unique];
      });
    return { ...scene, items };
  },
});
