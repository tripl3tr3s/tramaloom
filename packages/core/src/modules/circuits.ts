import { int } from "../prng/distributions.ts";
import type { Rng } from "../prng/prng.ts";
import type { Item, Lattice, Scene } from "../scene.ts";
import { addItems } from "../scene.ts";
import { defineModule } from "./types.ts";

type Pt = readonly [number, number];
type TerminalKind = "dot" | "ring" | "square" | "frame";
const TERMINALS = ["none", "dot", "ring", "square", "frame", "mixed"] as const;
const MIXED: readonly TerminalKind[] = ["dot", "ring", "square", "frame"];
// Right, down, left, up. Turning left/right is +-1 mod 4.
const DIRS: readonly Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Routing graph over the lattice: node positions plus which nodes may carry a wire. */
interface Graph {
  readonly nx: number;
  readonly ny: number;
  readonly pitch: number;
  readonly allowed: readonly boolean[];
  readonly pos: (i: number) => Pt;
  /** True when the segment between two neighbouring nodes borders at least one present cell. */
  readonly edgeOk: (a: number, b: number) => boolean;
}

function fallbackLattice(scene: Scene): Lattice {
  const { frame } = scene;
  const size = frame.w / 12;
  const rows = Math.max(1, Math.floor(frame.h / size));
  return {
    x: frame.x,
    y: frame.y + (frame.h - rows * size) / 2,
    cw: size,
    ch: size,
    cols: 12,
    rows,
    present: Array.from({ length: 12 * rows }, () => true),
  };
}

function buildGraph(L: Lattice, nodes: "centers" | "corners", res: number): Graph {
  const corners = nodes === "corners";
  const nx = L.cols * res + (corners ? 1 : 0);
  const ny = L.rows * res + (corners ? 1 : 0);
  const sx = L.cw / res;
  const sy = L.ch / res;
  const off = corners ? 0 : 0.5;
  const present = (c: number, r: number): boolean =>
    c >= 0 && r >= 0 && c < L.cols && r < L.rows && L.present[r * L.cols + c] === true;
  // Base cells touching lattice coordinate k (in node units).
  const baseOf = (k: number): readonly number[] => {
    if (!corners) return [Math.floor(k / res)];
    const c = Math.floor(k / res);
    return k % res === 0 ? [c - 1, c] : [c];
  };
  const allowed = Array.from({ length: nx * ny }, (_, idx) => {
    const i = idx % nx;
    const j = Math.floor(idx / nx);
    return baseOf(i).some((c) => baseOf(j).some((r) => present(c, r)));
  });
  const edgeOk = (a: number, b: number): boolean => {
    // Through cell centers both ends already sit in present cells.
    if (!corners) return true;
    const ia = a % nx;
    const ja = Math.floor(a / nx);
    const ib = b % nx;
    const jb = Math.floor(b / nx);
    if (ja === jb) {
      const c = Math.floor(Math.min(ia, ib) / res);
      return baseOf(ja).some((r) => present(c, r));
    }
    const r = Math.floor(Math.min(ja, jb) / res);
    return baseOf(ia).some((c) => present(c, r));
  };
  return {
    nx,
    ny,
    pitch: Math.min(sx, sy),
    allowed,
    pos: (idx) => [L.x + ((idx % nx) + off) * sx, L.y + (Math.floor(idx / nx) + off) * sy],
    edgeOk,
  };
}

const step = (g: Graph, idx: number, d: number): number => {
  const [dx, dy] = DIRS[d] ?? [0, 0];
  const i = (idx % g.nx) + dx;
  const j = Math.floor(idx / g.nx) + dy;
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
};

/** Neighbour of `from` in direction d if a wire may enter it, else -1. */
const enter = (g: Graph, busy: Uint8Array, from: number, d: number): number => {
  const m = step(g, from, d);
  return m >= 0 && g.allowed[m] === true && busy[m] === 0 && g.edgeOk(from, m) ? m : -1;
};

interface Wire {
  /** Stable identity, names the terminal stream so other wires appearing or vanishing never shift it. */
  readonly id: string;
  readonly path: readonly number[];
  readonly group: number;
  /** Which ends get a terminal: start uses startTerminal, end uses endTerminal. */
  readonly startCap: boolean;
  readonly endCap: boolean;
}

interface RouteOpts {
  readonly wires: number;
  readonly minLength: number;
  readonly maxLength: number;
  readonly turnChance: number;
  readonly maxTurns: number;
  readonly coverage: number;
}

/** Self-avoiding random walks. Each wire has its own stream, so adding wires never changes earlier ones. */
function routeWalks(g: Graph, busy: Uint8Array, o: RouteOpts, rngFor: (label: string) => Rng): Wire[] {
  const lo = Math.min(o.minLength, o.maxLength);
  const hi = Math.max(o.minLength, o.maxLength);
  const out: Wire[] = [];
  for (let w = 0; w < o.wires; w++) {
    const r = rngFor(`wire/${w}`);
    const target = int(r, lo, hi);
    let start = -1;
    for (let a = 0; a < 24 && start < 0; a++) {
      const n = Math.floor(r() * busy.length);
      if (g.allowed[n] === true && busy[n] === 0) start = n;
    }
    if (start < 0) continue;
    let dir = Math.floor(r() * 4);
    let turns = 0;
    const path = [start];
    busy[start] = 1;
    while (path.length - 1 < target) {
      // Fixed two draws per step keep the stream aligned whatever happens.
      const canTurn = turns < o.maxTurns;
      const wantTurn = r() < o.turnChance && canTurn;
      const side = r() < 0.5 ? 1 : 3;
      const t1 = (dir + side) % 4;
      const t2 = (dir + 4 - side) % 4;
      const atStart = path.length === 1;
      // The first step may leave in any direction; after that maxTurns is a hard cap.
      const order = atStart ? [dir, t1, t2, (dir + 2) % 4] : wantTurn ? [t1, t2, dir] : canTurn ? [dir, t1, t2] : [dir];
      const here = path[path.length - 1] ?? start;
      const next = order.find((d) => enter(g, busy, here, d) >= 0);
      if (next === undefined) break;
      if (!atStart && next !== dir) turns++;
      dir = next;
      const n = step(g, here, dir);
      busy[n] = 1;
      path.push(n);
    }
    if (path.length - 1 < lo) {
      path.forEach((n) => (busy[n] = 0));
      continue;
    }
    out.push({ id: `w${w}`, path, group: w, startCap: true, endCap: true });
  }
  return out;
}

/**
 * Spanning forest grown from `wires` roots, one step per root in turn so every
 * root gets its share. Each root extends its newest edge, preferring to go
 * straight (long corridors); turnChance instead picks a random frontier edge
 * (branchy growth).
 */
function routeTree(g: Graph, busy: Uint8Array, o: RouteOpts, r: Rng): Wire[] {
  const total = g.allowed.filter(Boolean).length;
  const target = Math.floor(total * o.coverage);
  const n = busy.length;
  const group = new Int32Array(n).fill(-1);
  // Local work buffers (never escape the function). Copying them per step would be quadratic.
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const la = adj.get(a);
    if (la) la.push(b);
    else adj.set(a, [b]);
    const lb = adj.get(b);
    if (lb) lb.push(a);
    else adj.set(b, [a]);
  };
  type Edge = readonly [from: number, to: number, dir: number];
  const fronts: Edge[][] = [];
  const pushEdges = (front: Edge[], from: number, inDir: number) => {
    const start = Math.floor(r() * 4); // always drawn
    const dirs = [0, 1, 2, 3].map((k) => (start + k) % 4).filter((d) => d !== inDir);
    // Straight on goes last so it is popped first.
    (inDir >= 0 ? [...dirs, inDir] : dirs).forEach((d) => {
      const m = enter(g, busy, from, d);
      if (m >= 0) front.push([from, m, d]);
    });
  };
  for (let k = 0; k < o.wires; k++) {
    for (let a = 0; a < 24; a++) {
      const m = Math.floor(r() * n);
      if (g.allowed[m] && busy[m] === 0) {
        busy[m] = 1;
        group[m] = fronts.length;
        adj.set(m, []);
        const front: Edge[] = [];
        fronts.push(front);
        pushEdges(front, m, -1);
        break;
      }
    }
  }
  let grown = fronts.length;
  let live = true;
  while (grown < target && live) {
    live = false;
    for (let k = 0; k < fronts.length && grown < target; k++) {
      const f = fronts[k] ?? [];
      while (f.length > 0) {
        if (r() < o.turnChance) {
          // Swap a random edge to the end (O(1) removal).
          const i = Math.floor(r() * f.length);
          const last = f.length - 1;
          const tmp = f[i] as Edge;
          f[i] = f[last] as Edge;
          f[last] = tmp;
        }
        const e = f.pop();
        if (!e || busy[e[1]] !== 0) continue;
        const [from, to, dir] = e;
        busy[to] = 1;
        group[to] = k;
        link(from, to);
        grown++;
        pushEdges(f, to, dir);
        live = true;
        break;
      }
    }
  }

  // Break the forest into chains between nodes whose degree is not 2.
  const deg = (m: number): number => adj.get(m)?.length ?? 0;
  const seen = new Set<number>();
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  const out: Wire[] = [];
  const nodes = [...adj.keys()].sort((a, b) => a - b);
  for (const u of nodes) {
    if (deg(u) === 2) continue;
    for (const v0 of adj.get(u) ?? []) {
      if (seen.has(key(u, v0))) continue;
      seen.add(key(u, v0));
      const path = [u, v0];
      let prev = u;
      let cur = v0;
      while (deg(cur) === 2) {
        const nxt = (adj.get(cur) ?? []).find((m) => m !== prev);
        if (nxt === undefined) break;
        seen.add(key(cur, nxt));
        path.push(nxt);
        prev = cur;
        cur = nxt;
      }
      out.push({ id: `t${u}-${v0}`, path, group: group[u] ?? 0, startCap: deg(u) === 1, endCap: deg(cur) === 1 });
    }
  }
  return out;
}

/** Drop collinear interior points so only real turns remain. */
function simplify(pts: readonly Pt[]): Pt[] {
  return pts.filter((p, i) => {
    const a = pts[i - 1];
    const b = pts[i + 1];
    if (!a || !b) return true;
    const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
    return Math.abs(cross) > 1e-12;
  });
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (a: Pt): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);
const toward = (from: Pt, to: Pt, d: number): Pt => {
  const v = sub(to, from);
  const l = len(v) || 1;
  return [from[0] + (v[0] / l) * d, from[1] + (v[1] / l) * d];
};

function trimEnds(pts: readonly Pt[], startBy: number, endBy: number): Pt[] {
  if (pts.length < 2) return [...pts];
  const first = pts[0] as Pt;
  const second = pts[1] as Pt;
  const last = pts[pts.length - 1] as Pt;
  const before = pts[pts.length - 2] as Pt;
  const firstLen = len(sub(second, first));
  const lastLen = len(sub(before, last));
  const head = toward(first, second, Math.min(startBy, firstLen * 0.45));
  const tail = toward(last, before, Math.min(endBy, lastLen * 0.45));
  return [head, ...pts.slice(1, -1), tail];
}

function shapeCorners(pts: readonly Pt[], kind: "sharp" | "chamfer" | "round", size: number): Pt[] {
  if (kind === "sharp" || size <= 0 || pts.length < 3) return [...pts];
  return pts.flatMap((p, i): Pt[] => {
    const a = pts[i - 1];
    const b = pts[i + 1];
    if (!a || !b) return [p];
    const c = Math.min(size, len(sub(p, a)) / 2, len(sub(b, p)) / 2);
    const p0 = toward(p, a, c);
    const p1 = toward(p, b, c);
    if (kind === "chamfer") return [p0, p1];
    // Quadratic bezier p0 -> p1 with control point at the corner.
    return [0, 0.25, 0.5, 0.75, 1].map((t): Pt => {
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]];
    });
  });
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.5;
  // Gamma 2 instead of the sRGB curve: only + and * so every JS engine agrees bit for bit.
  const ch = (s: string | undefined) => {
    const c = parseInt(s ?? "0", 16) / 255;
    return c * c;
  };
  return 0.2126 * ch(m[1]) + 0.7152 * ch(m[2]) + 0.0722 * ch(m[3]);
}

/** Fill of the topmost filled rect or circle under a point, else the background. */
function colorUnder(scene: Scene, [x, y]: Pt): string {
  for (let k = scene.items.length - 1; k >= 0; k--) {
    const it = scene.items[k];
    if (!it?.fill) continue;
    if (it.type === "rect" && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return it.fill;
    if (it.type === "circle" && (x - it.cx) ** 2 + (y - it.cy) ** 2 <= it.r * it.r) return it.fill;
  }
  return scene.background;
}

export const circuitsModule = defineModule({
  id: "circuits",
  label: "Circuits",
  description: "Routes orthogonal wires along the grid and caps them with terminals.",
  params: {
    style: {
      kind: "enum",
      label: "Routing",
      options: ["walk", "tree"],
      default: "walk",
      help: "walk: separate wires; tree: branching networks grown from roots",
    },
    nodes: {
      kind: "enum",
      label: "Run along",
      options: ["centers", "corners"],
      default: "centers",
      help: "centers: through cell middles; corners: along cell edges",
    },
    resolution: { kind: "int", label: "Resolution", min: 1, max: 4, default: 1, help: "Routing steps per cell" },
    wires: { kind: "int", label: "Wires / roots", min: 1, max: 200, default: 24 },
    minLength: { kind: "int", label: "Min length", min: 1, max: 40, default: 2 },
    maxLength: { kind: "int", label: "Max length", min: 1, max: 80, default: 12 },
    turnChance: { kind: "number", label: "Turn chance", min: 0, max: 1, step: 0.01, default: 0.3 },
    maxTurns: { kind: "int", label: "Max turns", min: 0, max: 20, default: 6, help: "walk only" },
    coverage: { kind: "number", label: "Coverage", min: 0.05, max: 1, step: 0.01, default: 0.5, help: "tree only" },
    corner: { kind: "enum", label: "Corners", options: ["sharp", "chamfer", "round"], default: "chamfer" },
    cornerSize: { kind: "number", label: "Corner size", min: 0, max: 0.5, step: 0.01, default: 0.35 },
    wireWidth: { kind: "number", label: "Wire width", min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
    startTerminal: { kind: "enum", label: "Start terminal", options: TERMINALS, default: "dot" },
    endTerminal: { kind: "enum", label: "End terminal", options: TERMINALS, default: "ring" },
    terminalSize: { kind: "number", label: "Terminal size", min: 0.05, max: 0.45, step: 0.01, default: 0.25 },
    junctions: { kind: "bool", label: "Junction dots", default: false, help: "tree only" },
    colorRule: { kind: "enum", label: "Color", options: ["contrast", "zone", "palette", "single"], default: "contrast" },
    wireColor: { kind: "color", label: "Single color", default: "#f4f1ea" },
  },
  apply(scene, v, ctx) {
    const g = buildGraph(scene.lattice ?? fallbackLattice(scene), v.nodes, v.resolution);
    const busy = new Uint8Array(g.nx * g.ny);
    const wires = v.style === "walk" ? routeWalks(g, busy, v, ctx.rng) : routeTree(g, busy, v, ctx.rng("tree"));

    const pal = scene.palette;
    const colors = pal?.colors.length ? pal.colors : ["#f4f1ea", "#111111"];
    const groupColor = new Map<number, string>();
    const colorFor = (group: number, at: Pt): string => {
      const cached = groupColor.get(group);
      if (cached) return cached;
      // One draw per group regardless of rule.
      const u = ctx.rng(`color/${group}`)();
      const choose = (xs: readonly string[]) => xs[Math.floor(u * xs.length)] ?? colors[0] ?? "#000000";
      let c: string;
      switch (v.colorRule) {
        case "single":
          c = v.wireColor;
          break;
        case "palette":
          c = choose(colors);
          break;
        case "zone":
          c = choose(pal ? (pal.zoneColors[pal.zoneAt(at[0], at[1])] ?? colors) : colors);
          break;
        case "contrast": {
          const base = luminance(colorUnder(scene, at));
          const far = colors.filter((x) => Math.abs(luminance(x) - base) >= 0.3);
          const best = [...colors].sort((a, b) => Math.abs(luminance(b) - base) - Math.abs(luminance(a) - base));
          c = far.length ? choose(far) : (best[0] ?? "#000000");
          break;
        }
      }
      groupColor.set(group, c);
      return c;
    };

    const pitch = g.pitch;
    const tr = v.terminalSize * pitch;
    const sw = v.wireWidth * pitch;
    const terminalOf = (setting: (typeof TERMINALS)[number], r: Rng): TerminalKind | null => {
      const u = r(); // always drawn
      if (setting === "none") return null;
      if (setting === "mixed") return MIXED[Math.floor(u * MIXED.length)] ?? "dot";
      return setting;
    };
    const hollow = (k: TerminalKind | null) => k === "ring" || k === "frame";
    const terminalItem = (k: TerminalKind, [x, y]: Pt, color: string): Item => {
      switch (k) {
        case "dot":
          return { type: "circle", cx: x, cy: y, r: tr, fill: color };
        case "ring":
          return { type: "circle", cx: x, cy: y, r: tr, stroke: color, strokeWidth: sw };
        case "square":
          return { type: "rect", x: x - tr, y: y - tr, w: 2 * tr, h: 2 * tr, fill: color };
        case "frame":
          return { type: "rect", x: x - tr, y: y - tr, w: 2 * tr, h: 2 * tr, stroke: color, strokeWidth: sw };
      }
    };

    const lines: Item[] = [];
    const caps: Item[] = [];
    wires.forEach((w) => {
      const raw = w.path.map(g.pos);
      const first = raw[0];
      const last = raw[raw.length - 1];
      if (!first || !last) return;
      const color = colorFor(w.group, first);
      const tRng = ctx.rng(`terminal/${w.id}`);
      const startKind = w.startCap ? terminalOf(v.startTerminal, tRng) : (tRng(), null);
      const endKind = w.endCap ? terminalOf(v.endTerminal, tRng) : (tRng(), null);
      const pts = shapeCorners(
        trimEnds(simplify(raw), hollow(startKind) ? tr : 0, hollow(endKind) ? tr : 0),
        v.corner,
        v.cornerSize * pitch,
      );
      lines.push({ type: "polyline", points: pts, stroke: color, strokeWidth: sw });
      if (startKind) caps.push(terminalItem(startKind, first, color));
      if (endKind) caps.push(terminalItem(endKind, last, color));
    });

    if (v.junctions && v.style === "tree") {
      // Chain ends meeting at a node: 3 or more means a junction. A component has one group.
      const ends = new Map<number, { count: number; group: number }>();
      wires.forEach((w) => {
        [w.path[0], w.path[w.path.length - 1]].forEach((n) => {
          if (n === undefined) return;
          ends.set(n, { count: (ends.get(n)?.count ?? 0) + 1, group: w.group });
        });
      });
      [...ends.entries()]
        .filter(([, e]) => e.count >= 3)
        .sort((a, b) => a[0] - b[0])
        .forEach(([n, e]) => {
          const p = g.pos(n);
          caps.push({ type: "circle", cx: p[0], cy: p[1], r: Math.max(sw, tr * 0.6), fill: colorFor(e.group, p) });
        });
    }

    return addItems(scene, [...lines, ...caps]);
  },
});
