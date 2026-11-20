import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
// Connection bits: north, east, south, west.
const N = 1;
const E = 2;
const S = 4;
const W = 8;
const ARC_STEPS = 12;
// Rational quarter-circle points (exact + and * arithmetic, no trig).
const UNIT: readonly Pt[] = Array.from({ length: ARC_STEPS + 1 }, (_, s): Pt => {
  const t = s / ARC_STEPS;
  const d = 1 + t * t;
  return [(1 - t * t) / d, (2 * t) / d];
});
const bits = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/**
 * Pipework on the base grid. Cells are filled in reading order and each picks its
 * east and south connections given the west and north ones it inherits, weighted
 * by the kind of piece that makes (a one-pass wave function collapse that can never
 * contradict itself). Every connected network gets one color.
 */
export const pipesModule = defineModule({
  id: "pipes",
  label: "Pipes",
  description: "Industrial pipework across the grid: straights, bends, tees, crosses and capped ends, one color per network. Follows the grid mask.",
  params: {
    density: { kind: "number", group: "Layout", label: "Density", min: 0, max: 1, step: 0.01, default: 0.7, help: "How few cells are left empty" },
    straight: { kind: "number", group: "Layout", label: "Straightness", min: 0, max: 1, step: 0.01, default: 0.55, help: "Straight runs versus bends" },
    branching: { kind: "number", group: "Layout", label: "Branching", min: 0, max: 1, step: 0.01, default: 0.2, help: "Tees and crosses" },
    ends: { kind: "number", group: "Layout", label: "Dead ends", min: 0, max: 1, step: 0.01, default: 0.15, help: "Pipes ending in a cap" },
    width: { kind: "number", group: "Look", label: "Pipe width", min: 0.08, max: 0.7, step: 0.01, default: 0.34, help: "Share of the cell size" },
    style: { kind: "enum", group: "Look", label: "Style", options: ["tube", "flat"], default: "tube", help: "tube: an outline around every pipe" },
    flanges: { kind: "bool", group: "Look", label: "Flanges", default: true, help: "Collars where pipes join between cells" },
    outlineColor: { kind: "color", group: "Look", label: "Outline color", help: "Color of the tube outlines, caps and flange edges", default: "#0d1b2a" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast", help: colorHelp({ per: "network" }) },
    color: { kind: "color", group: "Color", label: "Single color", help: "Used when Color is set to single", showIf: { param: "colorRule", is: ["single"] }, default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const L = scene.lattice;
    if (!L || L.cols < 1 || L.rows < 1) return scene;
    const { cols, rows } = L;
    const present = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && L.present[r * cols + c] === true;
    const weight = (mask: number): number => {
      switch (bits(mask)) {
        case 0:
          return (1 - v.density) * 3 + 0.02;
        case 1:
          return v.ends + 0.001;
        case 2:
          return mask === (N | S) || mask === (E | W) ? v.straight + 0.001 : 1 - v.straight + 0.001;
        case 3:
          return v.branching + 0.001;
        default:
          return v.branching * 0.5 + 0.001;
      }
    };

    // One draw per base cell, in reading order, whether or not the cell exists.
    const tileRng = ctx.rng("tile");
    const masks: number[] = Array.from({ length: cols * rows }, () => 0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = tileRng();
        if (!present(c, r)) continue;
        const inherit = (r > 0 && ((masks[(r - 1) * cols + c] ?? 0) & S) ? N : 0) | (c > 0 && ((masks[r * cols + c - 1] ?? 0) & E) ? W : 0);
        const canE = present(c + 1, r);
        const canS = present(c, r + 1);
        const options = [0, E, S, E | S].filter((o) => (!(o & E) || canE) && (!(o & S) || canS)).map((o) => inherit | o);
        const total = options.reduce((s, m) => s + weight(m), 0);
        let pick = u * total;
        const chosen = options.find((m) => (pick -= weight(m)) < 0) ?? options[options.length - 1] ?? inherit;
        masks[r * cols + c] = chosen;
      }
    }

    // Networks: union neighbouring cells joined by a pipe.
    const parent = masks.map((_, i) => i);
    const find = (i: number): number => {
      let x = i;
      while (parent[x] !== x) x = parent[x] as number;
      return x;
    };
    masks.forEach((m, i) => {
      const join = (j: number) => {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      };
      if (m & E) join(i + 1);
      if (m & S) join(i + cols);
    });
    const colorRng = ctx.rng("color");
    const under = colorLookup(scene);
    const netColor = new Map<number, string>();

    const w = v.width * Math.min(L.cw, L.ch);
    const outlines: Item[] = [];
    const cores: Item[] = [];
    const extras: Item[] = [];
    masks.forEach((m, i) => {
      if (!m) return;
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x0 = L.x + c * L.cw;
      const y0 = L.y + r * L.ch;
      const cx = x0 + L.cw / 2;
      const cy = y0 + L.ch / 2;
      const root = find(i);
      if (!netColor.has(root)) netColor.set(root, pickColor(scene, v.colorRule, colorRng(), [cx, cy], v.color, under));
      const color = netColor.get(root) as string;
      const mid = (b: number): Pt => (b === N ? [cx, y0] : b === S ? [cx, y0 + L.ch] : b === E ? [x0 + L.cw, cy] : [x0, cy]);
      const paths: Pt[][] = [];
      const elbow = bits(m) === 2 && m !== (N | S) && m !== (E | W);
      if (elbow) {
        // A quarter arc around the corner the two openings share.
        const kx = m & E ? x0 + L.cw : x0;
        const ky = m & S ? y0 + L.ch : y0;
        const sx = m & E ? -1 : 1;
        const sy = m & S ? -1 : 1;
        paths.push(UNIT.map(([a, b]): Pt => [kx + sx * a * (L.cw / 2), ky + sy * b * (L.ch / 2)]));
      } else if (m === (N | S) || m === (E | W)) {
        paths.push(m === (N | S) ? [mid(N), mid(S)] : [mid(W), mid(E)]);
      } else {
        for (const b of [N, E, S, W]) if (m & b) paths.push([[cx, cy], mid(b)]);
      }
      for (const pts of paths) {
        if (v.style === "tube") outlines.push({ type: "polyline", points: pts, stroke: v.outlineColor, strokeWidth: w * 1.4 });
        cores.push({ type: "polyline", points: pts, stroke: color, strokeWidth: w });
      }
      if (bits(m) === 1) {
        // A cap where the pipe ends.
        extras.push({ type: "circle", cx, cy, r: w * 0.62, fill: color, stroke: v.outlineColor, strokeWidth: w * 0.18 });
      }
      if (v.flanges) {
        // Collars on the east and south joins only, so each join gets exactly one.
        for (const b of [E, S]) {
          if (!(m & b)) continue;
          const [fx, fy] = mid(b);
          const long = w * 1.55;
          const thick = w * 0.42;
          const horizontal = b === S;
          extras.push({
            type: "rect",
            x: fx - (horizontal ? long : thick) / 2,
            y: fy - (horizontal ? thick : long) / 2,
            w: horizontal ? long : thick,
            h: horizontal ? thick : long,
            fill: color,
            stroke: v.outlineColor,
            strokeWidth: w * 0.14,
          });
        }
      }
    });
    return addItems(scene, [...outlines, ...cores, ...extras]);
  },
});
