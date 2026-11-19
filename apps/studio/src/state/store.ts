import type { ArtDocument, Layer, ParamSetting, TraitDef } from "@gridloom/core";
import { stepHash } from "@gridloom/core";
import { MAX_LAYERS } from "./limits.ts";

const HISTORY_LIMIT = 100;

/**
 * One undo step. `hash` is set only for steps that also changed the seed
 * (adopting a preset or a reseeded mutation), so undo brings back the same picture.
 * Ordinary edits leave it null: undoing a slider never rewinds a later reroll.
 */
export interface Snapshot {
  readonly doc: ArtDocument;
  readonly hash: string | null;
}

export interface StudioState {
  readonly doc: ArtDocument;
  readonly hash: string;
  /** Visited seeds, so left/right arrows walk back and forth reproducibly. */
  readonly seeds: readonly string[];
  readonly seedIndex: number;
  readonly past: readonly Snapshot[];
  readonly future: readonly Snapshot[];
  readonly selectedId: string | null;
  /** Snapshot taken when a drag starts; pushed to history only if the drag changes something. */
  readonly pendingCheckpoint: ArtDocument | null;
}

export type Action =
  | { readonly type: "setParam"; readonly layerId: string; readonly name: string; readonly setting: ParamSetting; readonly record: boolean }
  | { readonly type: "checkpoint" }
  | { readonly type: "toggleLayer"; readonly layerId: string }
  | { readonly type: "moveLayer"; readonly layerId: string; readonly dir: -1 | 1 }
  | { readonly type: "addLayer"; readonly module: string }
  | { readonly type: "removeLayer"; readonly layerId: string }
  | { readonly type: "duplicateLayer"; readonly layerId: string }
  | { readonly type: "select"; readonly layerId: string }
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "loadDoc"; readonly doc: ArtDocument }
  | { readonly type: "setTraits"; readonly traits: readonly TraitDef[] }
  /** Take a mutation or preset: one undo step for the doc, plus a seed step if the hash changed. */
  | { readonly type: "adopt"; readonly doc: ArtDocument; readonly hash: string }
  | { readonly type: "hydrate"; readonly doc: ArtDocument | null; readonly hash: string | null }
  | { readonly type: "setHash"; readonly hash: string }
  | { readonly type: "seedPrev" }
  | { readonly type: "seedNext" }
  | { readonly type: "undo" }
  | { readonly type: "redo" };

export function initialState(doc: ArtDocument, hash: string): StudioState {
  return {
    doc,
    hash,
    seeds: [hash],
    seedIndex: 0,
    past: [],
    future: [],
    selectedId: doc.layers[1]?.id ?? doc.layers[0]?.id ?? null,
    pendingCheckpoint: null,
  };
}

const commit = (s: StudioState, doc: ArtDocument, withHash = false): StudioState => ({
  ...s,
  doc,
  past: [...s.past, { doc: s.doc, hash: withHash ? s.hash : null }].slice(-HISTORY_LIMIT),
  future: [],
  pendingCheckpoint: null,
});

/** Keep the selection pointing at a layer that exists (after undo/redo). */
const withValidSelection = (s: StudioState): StudioState =>
  s.doc.layers.some((l) => l.id === s.selectedId)
    ? s
    : { ...s, selectedId: s.doc.layers[s.doc.layers.length - 1]?.id ?? null };

const mapLayers = (doc: ArtDocument, f: (l: Layer) => Layer): ArtDocument => ({ ...doc, layers: doc.layers.map(f) });

/** Smallest unused `${module}-${n}` id. Ids name random streams, so they are never reused within a doc. */
export function freshId(doc: ArtDocument, module: string): string {
  const used = new Set(doc.layers.map((l) => l.id));
  let n = 1;
  while (used.has(`${module}-${n}`)) n++;
  return `${module}-${n}`;
}

function pushSeed(s: StudioState, hash: string): StudioState {
  const seeds = [...s.seeds.slice(0, s.seedIndex + 1), hash].slice(-500);
  return { ...s, hash, seeds, seedIndex: seeds.length - 1 };
}

export function reducer(s: StudioState, a: Action): StudioState {
  switch (a.type) {
    case "setParam": {
      const doc = mapLayers(s.doc, (l) =>
        l.id === a.layerId ? { ...l, params: { ...l.params, [a.name]: a.setting } } : l,
      );
      if (a.record) return commit(s, doc);
      const snap = s.pendingCheckpoint;
      return snap
        ? { ...s, doc, past: [...s.past, { doc: snap, hash: null }].slice(-HISTORY_LIMIT), future: [], pendingCheckpoint: null }
        : { ...s, doc };
    }
    case "checkpoint":
      return { ...s, pendingCheckpoint: s.doc };
    case "toggleLayer": {
      const target = s.doc.layers.find((l) => l.id === a.layerId);
      if (!target || target.module === "canvas") return s;
      return commit(s, mapLayers(s.doc, (l) => (l.id === a.layerId ? { ...l, enabled: !l.enabled } : l)));
    }
    case "moveLayer": {
      const i = s.doc.layers.findIndex((l) => l.id === a.layerId);
      const j = i + a.dir;
      if (i < 1 || j < 1 || j >= s.doc.layers.length) return s; // canvas stays first
      const layers = s.doc.layers.map((l, k) => (k === i ? s.doc.layers[j] : k === j ? s.doc.layers[i] : l) as Layer);
      return commit(s, { ...s.doc, layers });
    }
    case "addLayer": {
      if (s.doc.layers.length >= MAX_LAYERS) return s;
      const layer: Layer = { id: freshId(s.doc, a.module), module: a.module, enabled: true, params: {} };
      return { ...commit(s, { ...s.doc, layers: [...s.doc.layers, layer] }), selectedId: layer.id };
    }
    case "removeLayer": {
      const target = s.doc.layers.find((l) => l.id === a.layerId);
      if (!target || target.module === "canvas") return s;
      const layers = s.doc.layers.filter((l) => l.id !== a.layerId);
      const selectedId = s.selectedId === a.layerId ? (layers[layers.length - 1]?.id ?? null) : s.selectedId;
      return { ...commit(s, { ...s.doc, layers }), selectedId };
    }
    case "duplicateLayer": {
      const i = s.doc.layers.findIndex((l) => l.id === a.layerId);
      const src = s.doc.layers[i];
      if (!src || src.module === "canvas" || s.doc.layers.length >= MAX_LAYERS) return s;
      const copy: Layer = { ...src, id: freshId(s.doc, src.module) };
      const layers = [...s.doc.layers.slice(0, i + 1), copy, ...s.doc.layers.slice(i + 1)];
      return { ...commit(s, { ...s.doc, layers }), selectedId: copy.id };
    }
    case "select":
      return { ...s, selectedId: a.layerId };
    case "rename":
      return { ...s, doc: { ...s.doc, name: a.name.slice(0, 100) } };
    case "loadDoc":
      return { ...commit(s, a.doc), selectedId: a.doc.layers[1]?.id ?? a.doc.layers[0]?.id ?? null };
    case "setTraits": {
      // Traits never change the picture, but they are part of the piece: undoable.
      const { traits: _old, ...rest } = s.doc;
      return commit(s, a.traits.length ? { ...rest, traits: a.traits } : rest);
    }
    case "adopt": {
      const sameDoc = a.doc === s.doc || JSON.stringify(a.doc) === JSON.stringify(s.doc);
      const sameHash = a.hash === s.hash;
      if (sameDoc && sameHash) return s;
      // A seed-only change lives on the seed trail (arrows), like a reroll.
      if (sameDoc) return pushSeed(s, a.hash);
      const committed = withValidSelection(commit(s, a.doc, !sameHash));
      return sameHash ? committed : pushSeed(committed, a.hash);
    }
    case "hydrate": {
      // Initial load from a link: replaces state without creating history.
      const base = initialState(a.doc ?? s.doc, a.hash ?? s.hash);
      return base;
    }
    case "setHash":
      return a.hash === s.hash ? s : pushSeed(s, a.hash);
    case "seedPrev": {
      if (s.seedIndex === 0) return s;
      const seedIndex = s.seedIndex - 1;
      return { ...s, seedIndex, hash: s.seeds[seedIndex] ?? s.hash };
    }
    case "seedNext": {
      if (s.seedIndex < s.seeds.length - 1) {
        const seedIndex = s.seedIndex + 1;
        return { ...s, seedIndex, hash: s.seeds[seedIndex] ?? s.hash };
      }
      return pushSeed(s, stepHash(s.hash, 1));
    }
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      const moved = withValidSelection({
        ...s,
        doc: prev.doc,
        past: s.past.slice(0, -1),
        future: [{ doc: s.doc, hash: prev.hash === null ? null : s.hash }, ...s.future],
        pendingCheckpoint: null,
      });
      return prev.hash === null || prev.hash === s.hash ? moved : pushSeed(moved, prev.hash);
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      const moved = withValidSelection({
        ...s,
        doc: next.doc,
        past: [...s.past, { doc: s.doc, hash: next.hash === null ? null : s.hash }],
        future: s.future.slice(1),
        pendingCheckpoint: null,
      });
      return next.hash === null || next.hash === s.hash ? moved : pushSeed(moved, next.hash);
    }
  }
}

/** Random hash for rerolls. The studio may use crypto; core never does. */
export function randomHash(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
