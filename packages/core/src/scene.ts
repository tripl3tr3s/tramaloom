/**
 * Everything is drawn in a normalised space where the short side is 1.
 * Renderers scale once; modules never see pixels.
 */

export interface Paint {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  /** 0..1, applies to fill and stroke together. Omitted means opaque. */
  readonly opacity?: number;
}

export interface RectItem extends Paint {
  readonly type: "rect";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r?: number;
}
export interface CircleItem extends Paint {
  readonly type: "circle";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}
export interface PolylineItem extends Paint {
  readonly type: "polyline";
  readonly points: readonly (readonly [number, number])[];
  readonly closed?: boolean;
}

/** Many same-sized, same-paint dots in one item (grain, stipple). Drawn as a single path. */
export interface DotsItem extends Paint {
  readonly type: "dots";
  readonly points: readonly (readonly [number, number])[];
  readonly r: number;
}

export type Item = RectItem | CircleItem | PolylineItem | DotsItem;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Cell extends Box {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly depth: number;
}

/**
 * The base grid before subdivision and masking, so modules like Circuits can
 * route on it. `present[row * cols + col]` is true when that base cell survived the mask.
 */
export interface Lattice {
  readonly x: number;
  readonly y: number;
  readonly cw: number;
  readonly ch: number;
  readonly cols: number;
  readonly rows: number;
  readonly present: readonly boolean[];
}

export interface PaletteState {
  readonly name: string;
  readonly colors: readonly string[];
  readonly zoneCount: number;
  /** Colors available in each zone, indexed by zone. */
  readonly zoneColors: readonly (readonly string[])[];
  /** Zone index for a point in normalised space. */
  readonly zoneAt: (x: number, y: number) => number;
}

export interface Scene {
  readonly width: number;
  readonly height: number;
  readonly frame: Box;
  readonly background: string;
  readonly cornerRadius: number;
  readonly cells: readonly Cell[];
  readonly lattice: Lattice | null;
  readonly palette: PaletteState | null;
  readonly items: readonly Item[];
}

export function emptyScene(): Scene {
  return {
    width: 1,
    height: 1,
    frame: { x: 0, y: 0, w: 1, h: 1 },
    background: "#ffffff",
    cornerRadius: 0,
    cells: [],
    lattice: null,
    palette: null,
    items: [],
  };
}

export const addItems = (scene: Scene, items: readonly Item[]): Scene => ({
  ...scene,
  items: [...scene.items, ...items],
});
