import type { Item } from "../scene.ts";
import type { Drawing } from "./drawing.ts";

/** Paper sizes in millimetres, portrait (width, height). */
export const PAPERS = {
  a5: [148, 210],
  a4: [210, 297],
  a3: [297, 420],
  letter: [215.9, 279.4],
} as const;
export type Paper = keyof typeof PAPERS;

export interface PlotterOptions {
  readonly paper: Paper;
  /** "auto" turns the sheet to match the artwork. */
  readonly orientation: "auto" | "portrait" | "landscape";
  readonly marginMm: number;
  /** Nib width, used for the preview stroke only; plotters draw with whatever pen is loaded. */
  readonly penMm: number;
  /** Grain texture; off by default, since thousands of tiny circles take ages to plot. Dots that are the drawing (an attractor) are always kept. */
  readonly includeTexture: boolean;
}

export const DEFAULT_PLOTTER: PlotterOptions = { paper: "a4", orientation: "auto", marginMm: 15, penMm: 0.4, includeTexture: false };

export interface PenLayer {
  readonly color: string;
  readonly paths: number;
  /** Times the pen goes down: one per path, one per dot. Dominates plotting time for stipples. */
  readonly lifts: number;
  /** Pen-down distance in millimetres. */
  readonly lengthMm: number;
}

export interface PlotterSvg {
  readonly svg: string;
  /** One complete document per pen, same sheet and placement, for single-pen plotters. */
  readonly penSvgs: readonly string[];
  readonly layers: readonly PenLayer[];
  readonly widthMm: number;
  readonly heightMm: number;
}

type Pt = readonly [number, number];
const n = (v: number): string => (Math.round(v * 1e4) / 1e4).toString();
const esc = (s: string): string => s.replace(/[<>&"]/g, "");
const dist = (a: Pt, b: Pt): number => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
const polyLength = (pts: readonly Pt[], closed: boolean): number =>
  pts.reduce((sum, p, i) => sum + (i ? dist(pts[i - 1] as Pt, p) : 0), 0) + (closed && pts.length > 2 ? dist(pts[pts.length - 1] as Pt, pts[0] as Pt) : 0);

/** One item as outline geometry: its SVG element (no paint), its length in scene units and its pen-downs. */
function outline(it: Item, includeTexture: boolean): { readonly svg: string; readonly length: number; readonly lifts?: number } | null {
  switch (it.type) {
    case "rect": {
      const r = it.r ? ` rx="${n(it.r)}"` : "";
      // Rounded corners shorten the path a little; the estimate keeps the square perimeter.
      return { svg: `<rect x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${r}/>`, length: 2 * (it.w + it.h) };
    }
    case "circle":
      return { svg: `<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}"/>`, length: 2 * Math.PI * it.r };
    case "polyline": {
      if (it.points.length < 2) return null;
      const tag = it.closed ? "polygon" : "polyline";
      const pts = it.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
      return { svg: `<${tag} points="${pts}"/>`, length: polyLength(it.points, it.closed === true) };
    }
    case "dots":
      if (it.texture) {
        if (!includeTexture) return null;
        return {
          svg: it.points.map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(it.r)}"/>`).join(""),
          length: it.points.length * 2 * Math.PI * it.r,
          lifts: it.points.length,
        };
      }
      // Dots that are the drawing: one pen tap each, a zero-length stroke that round caps show as a dot.
      if (!it.points.length) return null;
      return { svg: `<path d="${it.points.map(([x, y]) => `M${n(x)} ${n(y)}h0`).join("")}"/>`, length: 0, lifts: it.points.length };
  }
}

/**
 * The scene as pen strokes for a plotter: every shape becomes its outline (fills
 * are not hatched), grouped into one Inkscape layer per color in drawing order,
 * so each layer is one pen. Shapes painted in the background color are dropped:
 * they are invisible on screen but would still be drawn. Sized in millimetres,
 * centred on the sheet inside the margin.
 */
export function toPlotterSVG(scene: Drawing, opts: PlotterOptions = DEFAULT_PLOTTER): PlotterSvg {
  const [pw, ph] = PAPERS[opts.paper];
  const landscape = opts.orientation === "landscape" || (opts.orientation === "auto" && scene.width > scene.height);
  const W = landscape ? Math.max(pw, ph) : Math.min(pw, ph);
  const H = landscape ? Math.min(pw, ph) : Math.max(pw, ph);
  const margin = Math.max(0, Math.min(Number.isFinite(opts.marginMm) ? opts.marginMm : DEFAULT_PLOTTER.marginMm, Math.min(W, H) / 2 - 1));
  const k = Math.min((W - 2 * margin) / scene.width, (H - 2 * margin) / scene.height);
  const ox = (W - scene.width * k) / 2;
  const oy = (H - scene.height * k) / 2;
  const bg = scene.background.toLowerCase();

  // Colors in order of first appearance; each collects its shapes.
  const order: string[] = [];
  const groups = new Map<string, { svg: string[]; length: number; lifts: number }>();
  for (const it of scene.items) {
    const color = (it.stroke ?? it.fill ?? "").toLowerCase();
    if (!color || color === bg) continue;
    const shape = outline(it, opts.includeTexture);
    if (!shape) continue;
    const g = groups.get(color) ?? { svg: [], length: 0, lifts: 0 };
    if (!groups.has(color)) {
      groups.set(color, g);
      order.push(color);
    }
    g.svg.push(shape.svg);
    g.length += shape.length;
    g.lifts += shape.lifts ?? 1;
  }

  // Inputs may be mid-edit (a field holding "0" on the way to "0.4"): keep the nib sane here.
  const stroke = n(Math.max(0.05, Number.isFinite(opts.penMm) ? opts.penMm : DEFAULT_PLOTTER.penMm) / k);
  const layers: PenLayer[] = order.map((color) => {
    const g = groups.get(color) as { svg: string[]; length: number; lifts: number };
    return { color, paths: g.svg.length, lifts: g.lifts, lengthMm: g.length * k };
  });
  const body = order.map((color, i) => {
    const g = groups.get(color) as { svg: string[]; length: number; lifts: number };
    return `<g inkscape:groupmode="layer" inkscape:label="${i + 1} ${esc(color)}" id="pen${i + 1}" fill="none" stroke="${esc(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">\n${g.svg.join("\n")}\n</g>`;
  });
  const page = (groups: readonly string[]): string =>
    [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}">`,
      `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k)})">`,
      ...groups,
      "</g>",
      "</svg>",
    ].join("\n");
  return { svg: page(body), penSvgs: body.map((g) => page([g])), layers, widthMm: W, heightMm: H };
}
