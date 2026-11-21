import type { ArtDocument, Layer } from "./document.ts";
import type { Registry } from "./modules/registry.ts";
import { defaultRegistry, layerDef } from "./modules/registry.ts";
import type { ParamSetting, ParamSpec, ParamValue, Variation } from "./params/params.ts";
import type { Rng } from "./prng/prng.ts";

export interface MutateOptions {
  /** 0 changes nothing, 1 changes most settings by up to half their range. */
  readonly amount: number;
  /** Layer ids to mutate. Omitted: every layer except the canvas (aspect changes are too disruptive). */
  readonly layers?: readonly string[];
}

const MAX_WEIGHT = 1000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const currentValue = (spec: ParamSpec, s: ParamSetting | undefined): ParamValue => {
  const v = s?.value;
  switch (spec.kind) {
    case "number":
    case "int":
      return typeof v === "number" && Number.isFinite(v) ? clamp(v, spec.min, spec.max) : spec.default;
    case "enum":
      return typeof v === "string" && spec.options.includes(v) ? v : spec.default;
    case "bool":
      return typeof v === "boolean" ? v : spec.default;
    case "color":
      return typeof v === "string" ? v : spec.default;
  }
};

const snap = (spec: ParamSpec, v: number): number => {
  if (spec.kind === "int") return Math.round(v);
  if (spec.kind !== "number") return v;
  const s = spec.min + Math.round((v - spec.min) / spec.step) * spec.step;
  return Number(clamp(s, spec.min, spec.max).toFixed(6));
};

/**
 * Perturb one setting. Draws exactly three numbers whatever happens, so the
 * mutation of one setting never depends on what happened to earlier ones.
 */
function mutateSetting(spec: ParamSpec, s: ParamSetting | undefined, r: Rng, amount: number): ParamSetting | undefined {
  const uPick = r();
  const uA = r();
  const uB = r();
  // Even a small amount touches something; 0 touches nothing.
  const chance = amount <= 0 ? 0 : 0.1 + amount * 0.5;
  if (s?.locked || uPick >= chance) return s;

  const value = currentValue(spec, s);
  const vary = s?.vary;
  if (vary?.kind === "weights") {
    // Move one unit of weight from one option to another: the total never grows,
    // so repeated mutation drifts the odds without collapsing them onto one option.
    const keys =
      spec.kind === "enum"
        ? spec.options
        : spec.kind === "bool"
          ? ["false", "true"]
          : Object.keys(vary.weights).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const up = keys[Math.floor(uA * keys.length)];
    const down = keys[Math.floor(uB * keys.length)];
    if (up === undefined || down === undefined || up === down) return s;
    const wDown = vary.weights[down] ?? 0;
    const wUp = vary.weights[up] ?? 0;
    if (wDown <= 0 || wUp >= MAX_WEIGHT) return s;
    const weights = { ...vary.weights, [up]: wUp + 1, [down]: wDown - 1 };
    const next = spec.kind === "enum" ? { value: up } : {};
    return { ...s, value, ...next, vary: { kind: "weights", weights } };
  }
  switch (spec.kind) {
    case "number":
    case "int": {
      const delta = (uA * 2 - 1) * amount * (spec.max - spec.min) * 0.5;
      const next = snap(spec, clamp((value as number) + delta, spec.min, spec.max));
      // A varying number moves its whole range by the same amount, keeping its width.
      const shifted: Variation | undefined =
        vary?.kind === "range"
          ? (() => {
              const lo = Math.min(vary.min, vary.max);
              const hi = Math.max(vary.min, vary.max);
              const d = clamp(delta, spec.min - lo, spec.max - hi);
              return { ...vary, min: snap(spec, lo + d), max: snap(spec, hi + d) };
            })()
          : vary;
      return { ...s, value: next, ...(shifted ? { vary: shifted } : {}) };
    }
    case "enum":
      return { ...s, value: spec.options[Math.floor(uA * spec.options.length)] ?? spec.default };
    case "bool":
      return uA < 0.5 ? { ...s, value: !value } : s;
    case "color":
      // Colors come from palettes; free colors stay as the artist set them.
      return s;
  }
}

/**
 * Returns a mutated copy of the document. Pure and deterministic for a given rng:
 * every layer and setting gets its own fixed number of draws, in stack order.
 */
export function mutateDocument(
  doc: ArtDocument,
  rngFor: (label: string) => Rng,
  opts: MutateOptions,
  registry: Registry = defaultRegistry,
): ArtDocument {
  const amount = clamp(opts.amount, 0, 1);
  // Hidden layers are left alone: changing them would show nothing.
  const inScope = (l: Layer) => l.enabled && (opts.layers ? opts.layers.includes(l.id) : l.module !== "canvas");
  const layers = doc.layers.map((layer): Layer => {
    const def = layerDef(registry, layer);
    if (!def || !inScope(layer)) return layer;
    const params = Object.fromEntries(
      Object.entries(def.params).flatMap(([name, spec]) => {
        const next = mutateSetting(spec, layer.params[name], rngFor(`${layer.id}/${name}`), amount);
        return next ? [[name, next] as const] : [];
      }),
    );
    // Settings the module no longer knows are kept as they were.
    const unknown = Object.fromEntries(Object.entries(layer.params).filter(([k]) => !Object.hasOwn(def.params, k)));
    return { ...layer, params: { ...unknown, ...params } };
  });
  return { ...doc, layers };
}
