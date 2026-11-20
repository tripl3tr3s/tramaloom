import type { Item } from "../scene.ts";
import { addItems } from "../scene.ts";
import { COLOR_RULES, colorLookup, pickColor } from "./color.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];

/**
 * A perfect maze on the base grid: a random spanning tree grown by depth-first
 * search (recursive backtracker), one tree per connected region of the mask.
 * `braid` then opens a wall at that share of dead ends, so loops appear.
 */
export const mazeModule = defineModule({
  id: "maze",
  label: "Maze",
  description: "A maze carved through the base grid, drawn as walls or as the corridors themselves. Follows the grid mask.",
  params: {
    style: { kind: "enum", group: "Maze", label: "Draw", options: ["walls", "paths"], default: "walls", help: "walls: the maze's walls; paths: lines through the corridors" },
    braid: { kind: "number", group: "Maze", label: "Braid", min: 0, max: 1, step: 0.01, default: 0, help: "Share of dead ends opened into loops" },
    border: { kind: "bool", group: "Maze", label: "Outer wall", default: true, help: "Walls only: draw the boundary too" },
    lineWidth: { kind: "number", group: "Maze", label: "Line width", min: 0.02, max: 0.6, step: 0.01, default: 0.14, help: "Share of the cell size" },
    colorRule: { kind: "enum", group: "Color", label: "Color", options: COLOR_RULES, default: "contrast" },
    color: { kind: "color", group: "Color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const L = scene.lattice;
    if (!L || L.cols < 1 || L.rows < 1) return scene;
    const { cols, rows } = L;
    const at = (c: number, r: number): number => r * cols + c;
    const present = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && L.present[at(c, r)] === true;

    // Open passages, keyed by the lower cell index then the direction (0 right, 1 down).
    const open = new Set<number>();
    const key = (a: number, b: number): number => (a < b ? a * 2 + (b - a === 1 ? 0 : 1) : b * 2 + (a - b === 1 ? 0 : 1));
    const neighbours = (i: number): number[] => {
      const c = i % cols;
      const r = (i - c) / cols;
      return [
        [c + 1, r],
        [c, r + 1],
        [c - 1, r],
        [c, r - 1],
      ].flatMap(([x, y]) => (present(x as number, y as number) ? [at(x as number, y as number)] : []));
    };

    const carve = ctx.rng("carve");
    const seen = new Set<number>();
    for (let start = 0; start < cols * rows; start++) {
      if (seen.has(start) || !L.present[start]) continue;
      // Iterative backtracker: an explicit stack, so big grids never overflow the call stack.
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const cur = stack[stack.length - 1] as number;
        const fresh = neighbours(cur).filter((n) => !seen.has(n));
        if (!fresh.length) {
          stack.pop();
          continue;
        }
        const next = fresh[Math.floor(carve() * fresh.length)] as number;
        open.add(key(cur, next));
        seen.add(next);
        stack.push(next);
      }
    }

    // Braid: one draw per cell, whether or not it is a dead end, so the stream stays aligned.
    const braid = ctx.rng("braid");
    const pick = ctx.rng("braidPick");
    for (let i = 0; i < cols * rows; i++) {
      const u = braid();
      const w = pick();
      if (!L.present[i]) continue;
      const ns = neighbours(i);
      const exits = ns.filter((n) => open.has(key(i, n)));
      if (exits.length !== 1 || u >= v.braid) continue;
      const closed = ns.filter((n) => !open.has(key(i, n)));
      const n = closed[Math.floor(w * closed.length)];
      if (n !== undefined) open.add(key(i, n));
    }

    const colorRng = ctx.rng("color");
    const under = colorLookup(scene);
    const width = v.lineWidth * Math.min(L.cw, L.ch);
    const segment = (a: Pt, b: Pt): Item => {
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return { type: "polyline", points: [a, b], stroke: pickColor(scene, v.colorRule, colorRng(), mid, v.color, under), strokeWidth: width };
    };
    const x = (c: number): number => L.x + c * L.cw;
    const y = (r: number): number => L.y + r * L.ch;

    const items: Item[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!present(c, r)) continue;
        const i = at(c, r);
        if (v.style === "paths") {
          const center: Pt = [x(c) + L.cw / 2, y(r) + L.ch / 2];
          if (present(c + 1, r) && open.has(key(i, at(c + 1, r)))) items.push(segment(center, [center[0] + L.cw, center[1]]));
          if (present(c, r + 1) && open.has(key(i, at(c, r + 1)))) items.push(segment(center, [center[0], center[1] + L.ch]));
          continue;
        }
        // Walls: right and bottom of every cell, top and left only on the boundary.
        const wall = (n: number | null, outer: boolean): boolean => (n === null ? outer && v.border : !open.has(key(i, n)));
        const right = present(c + 1, r) ? at(c + 1, r) : null;
        const down = present(c, r + 1) ? at(c, r + 1) : null;
        if (wall(right, true)) items.push(segment([x(c + 1), y(r)], [x(c + 1), y(r + 1)]));
        if (wall(down, true)) items.push(segment([x(c), y(r + 1)], [x(c + 1), y(r + 1)]));
        if (!present(c - 1, r) && v.border) items.push(segment([x(c), y(r)], [x(c), y(r + 1)]));
        if (!present(c, r - 1) && v.border) items.push(segment([x(c), y(r)], [x(c + 1), y(r)]));
      }
    }
    return addItems(scene, items);
  },
});
