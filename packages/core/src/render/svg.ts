import type { Item, Paint, Scene } from "../scene.ts";

const n = (v: number): string => (Math.round(v * 1e5) / 1e5).toString();
const esc = (s: string): string => s.replace(/[<>&"]/g, "");

function paintAttrs(p: Paint): string {
  const fill = `fill="${p.fill ? esc(p.fill) : "none"}"`;
  const stroke = p.stroke ? ` stroke="${esc(p.stroke)}" stroke-width="${n(p.strokeWidth ?? 0.002)}"` : "";
  return fill + stroke;
}

function itemToSvg(it: Item): string {
  switch (it.type) {
    case "rect": {
      const r = it.r ? ` rx="${n(it.r)}"` : "";
      const crisp = !it.r && !it.stroke ? ` shape-rendering="crispEdges"` : "";
      return `<rect${crisp} x="${n(it.x)}" y="${n(it.y)}" width="${n(it.w)}" height="${n(it.h)}"${r} ${paintAttrs(it)}/>`;
    }
    case "circle":
      return `<circle cx="${n(it.cx)}" cy="${n(it.cy)}" r="${n(it.r)}" ${paintAttrs(it)}/>`;
    case "polyline": {
      const pts = it.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
      const tag = it.closed ? "polygon" : "polyline";
      return `<${tag} points="${pts}" stroke-linecap="round" stroke-linejoin="round" ${paintAttrs(it)}/>`;
    }
  }
}

export interface SvgOptions {
  /** Pixel width of the long side for the width/height attributes. */
  readonly size?: number;
}

/** Serialise a scene to an SVG document in normalised viewBox units. */
export function toSVG(scene: Scene, opts: SvgOptions = {}): string {
  const long = Math.max(scene.width, scene.height);
  const size = opts.size ?? 1000;
  const pw = Math.round((scene.width / long) * size);
  const ph = Math.round((scene.height / long) * size);
  const r = scene.cornerRadius;
  const bg = `<rect width="${n(scene.width)}" height="${n(scene.height)}"${r ? ` rx="${n(r)}"` : ""} fill="${esc(scene.background)}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(scene.width)} ${n(scene.height)}" width="${pw}" height="${ph}">`,
    bg,
    ...scene.items.map(itemToSvg),
    "</svg>",
  ].join("\n");
}
