import type { ArtDocument, ResolvedLayer } from "./document.ts";
import { resolveDocument } from "./document.ts";
import { stepHash } from "./prng/prng.ts";
import type { Registry } from "./modules/registry.ts";
import { defaultRegistry, getModule } from "./modules/registry.ts";
import type { Distribution, ParamSpec, ParamValue } from "./params/params.ts";

/** A numeric bin: values up to and including `upTo` get `label`. The last bin has no `upTo`. */
export interface TraitBin {
  readonly label: string;
  readonly upTo?: number;
}

/**
 * A collector-facing feature backed by one setting. It describes the work, it
 * does not configure it: the value comes from the resolved setting, which is a
 * pure function of the hash, so traits never depend on rendering.
 */
export interface TraitDef {
  readonly name: string;
  readonly layerId: string;
  readonly param: string;
  /** Numeric settings only. Without bins a number is reported as itself (for countable things). */
  readonly bins?: readonly TraitBin[];
}

export type TraitValue = string | number;
export type Traits = Readonly<Record<string, TraitValue>>;

export const NONE = "None";

/** The trait value a resolved setting value maps to (bins, Yes/No, or the value itself). */
export function traitLabel(def: TraitDef, value: ParamValue | undefined): TraitValue {
  if (value === undefined) return NONE;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  const bins = def.bins ?? [];
  if (bins.length === 0) return value;
  const hit = bins.find((b) => b.upTo === undefined || value <= b.upTo);
  return hit?.label ?? bins[bins.length - 1]?.label ?? String(value);
}

/** Trait values from already-resolved layers (no extra work when you have them). */
export function traitsFromResolved(doc: ArtDocument, resolved: readonly ResolvedLayer[]): Traits {
  return Object.fromEntries(
    (doc.traits ?? []).map((t) => [t.name, traitLabel(t, resolved.find((l) => l.id === t.layerId)?.values[t.param])]),
  );
}

/** Pure function of doc + hash. Resolves settings only; nothing is drawn. */
export function computeTraits(doc: ArtDocument, hash: string, registry: Registry = defaultRegistry): Traits {
  return traitsFromResolved(doc, resolveDocument(doc, hash, registry));
}

// ---------------------------------------------------------------------------
// Expected distribution (the rarity table implied by the settings)

/** P(unit <= t) for each distribution of resolveParam's unit draw. */
function cdf(dist: Distribution, t: number): number {
  if (t <= 0) return 0;
  const x = Math.min(1, t);
  switch (dist) {
    case "uniform":
      return x;
    case "low": // u^2
      return Math.sqrt(x);
    case "high": // 1 - (1-u)^2
      return 1 - Math.sqrt(1 - x);
    case "gaussian": {
      // 0.5 + N(0,1) * 0.18, clamped to [0, 1)
      if (x >= 1) return 1;
      const z = (x - 0.5) / 0.18 / Math.SQRT2;
      return 0.5 * (1 + erf(z));
    }
  }
}

// Abramowitz-Stegun 7.1.26; UI estimate only, never used for generation.
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export interface Expected {
  /** Share per label, summing to 1. */
  readonly shares: Readonly<Record<string, number>>;
  /** Exact (weights, fixed, int ranges) or approximate (stepped number ranges). */
  readonly exact: boolean;
}

const add = (acc: Record<string, number>, k: string, p: number) => ({ ...acc, [k]: (acc[k] ?? 0) + p });

/**
 * What the settings say a trait should look like over a large edition, or null
 * when that cannot be stated (an unbinned continuous number).
 */
export function expectedDistribution(doc: ArtDocument, trait: TraitDef, registry: Registry = defaultRegistry): Expected | null {
  const layer = doc.layers.find((l) => l.id === trait.layerId);
  if (!layer || !layer.enabled) return { shares: { [NONE]: 1 }, exact: true };
  const spec: ParamSpec | undefined = getModule(registry, layer.module)?.params[trait.param];
  // A setting the module no longer has resolves to nothing, which computeTraits reports as None.
  if (!spec) return { shares: { [NONE]: 1 }, exact: true };
  const setting = layer.params[trait.param];
  const one = (v: ParamValue): Expected => ({ shares: { [String(traitLabel(trait, v))]: 1 }, exact: true });
  // Mirror resolveParam's coercion, so labels match what generation produces.
  const coerce = (v: ParamValue | undefined): ParamValue => {
    if (spec.kind === "enum") return typeof v === "string" && spec.options.includes(v) ? v : spec.default;
    if (spec.kind === "bool") return typeof v === "boolean" ? v : spec.default;
    if (spec.kind === "number" || spec.kind === "int") {
      const n = typeof v === "number" && Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default;
      return spec.kind === "int" ? Math.round(n) : n;
    }
    return typeof v === "string" ? v : spec.default;
  };
  const fixedValue = (): ParamValue => coerce(setting?.value);

  const vary = setting?.vary;
  if (!vary || setting?.locked) return one(fixedValue());

  if (vary.kind === "weights") {
    const keys =
      spec.kind === "enum" ? spec.options : spec.kind === "bool" ? ["false", "true"] : Object.keys(vary.weights);
    const entries = keys.map((k) => [k, Math.max(0, vary.weights[k] ?? 0)] as const).filter(([, w]) => w > 0);
    const total = entries.reduce((a, [, w]) => a + w, 0);
    if (total === 0) return one(fixedValue());
    const toValue = (k: string): ParamValue =>
      coerce(spec.kind === "bool" ? k === "true" : spec.kind === "enum" || spec.kind === "color" ? k : Number(k));
    return {
      shares: entries.reduce<Record<string, number>>((acc, [k, w]) => add(acc, String(traitLabel(trait, toValue(k))), w / total), {}),
      exact: true,
    };
  }

  if (spec.kind !== "number" && spec.kind !== "int") return one(fixedValue());
  const lo = Math.min(Math.max(Math.min(vary.min, vary.max), spec.min), spec.max);
  const hi = Math.min(Math.max(Math.max(vary.min, vary.max), spec.min), spec.max);

  if (spec.kind === "int") {
    const n = hi - lo + 1;
    let shares: Record<string, number> = {};
    for (let k = lo; k <= hi; k++) {
      // The lowest value also takes the clamped mass below 0 (gaussian tails).
      const below = k === lo ? 0 : cdf(vary.dist, (k - lo) / n);
      const p = cdf(vary.dist, (k + 1 - lo) / n) - below;
      shares = add(shares, String(traitLabel(trait, k)), p);
    }
    return { shares, exact: vary.dist !== "gaussian" };
  }

  const bins = trait.bins ?? [];
  if (bins.length === 0) return null;
  const span = hi - lo;
  let prev = 0;
  let shares: Record<string, number> = {};
  for (const b of bins) {
    const upToU = b.upTo === undefined ? 1 : span === 0 ? (lo <= b.upTo ? 1 : 0) : (b.upTo - lo) / span;
    const c = cdf(vary.dist, upToU);
    shares = add(shares, b.label, Math.max(0, c - prev));
    prev = Math.max(prev, c);
  }
  return { shares, exact: false };
}

// ---------------------------------------------------------------------------
// Census

export interface TraitCensus {
  readonly name: string;
  /** Measured count per value, in first-seen order. */
  readonly counts: Readonly<Record<string, number>>;
  readonly expected: Expected | null;
}

export interface CensusResult {
  readonly total: number;
  readonly traits: readonly TraitCensus[];
  /** Hashes whose full trait tuple repeats an earlier one. */
  readonly duplicateTuples: number;
}

export function census(doc: ArtDocument, hashes: readonly string[], registry: Registry = defaultRegistry): CensusResult {
  const defs = doc.traits ?? [];
  if (defs.length === 0) return { total: hashes.length, duplicateTuples: 0, traits: [] };
  const counts = defs.map(() => new Map<string, number>());
  const tuples = new Set<string>();
  let duplicates = 0;
  for (const h of hashes) {
    const t = computeTraits(doc, h, registry);
    defs.forEach((d, i) => {
      const k = String(t[d.name]);
      const m = counts[i];
      m?.set(k, (m.get(k) ?? 0) + 1);
    });
    const tuple = JSON.stringify(defs.map((d) => t[d.name]));
    if (tuples.has(tuple)) duplicates++;
    else tuples.add(tuple);
  }
  return {
    total: hashes.length,
    duplicateTuples: duplicates,
    traits: defs.map((d, i) => ({
      name: d.name,
      counts: Object.fromEntries(counts[i] ?? []),
      expected: expectedDistribution(doc, d, registry),
    })),
  };
}

export type CensusFlag = "never" | "dominant" | "too-rare";

/**
 * Warnings from the genart checklist: a value the settings allow that never
 * appeared, one value covering 80% or more, or a value expected less than once
 * over the real edition.
 */
export function censusFlags(t: TraitCensus, total: number, editionSize: number): Readonly<Record<string, readonly CensusFlag[]>> {
  const labels = [...new Set([...Object.keys(t.expected?.shares ?? {}), ...Object.keys(t.counts)])];
  return Object.fromEntries(
    labels.map((k) => {
      const measured = (t.counts[k] ?? 0) / Math.max(1, total);
      const expected = t.expected?.shares[k];
      const flags: CensusFlag[] = [];
      // Only meaningful when the sample should have shown it several times over.
      if ((expected ?? 0) * total >= 5 && (t.counts[k] ?? 0) === 0) flags.push("never");
      if (measured >= 0.8 && labels.length > 1) flags.push("dominant");
      const share = expected ?? measured;
      if (share > 0 && share * editionSize < 1) flags.push("too-rare");
      return [k, flags];
    }),
  );
}

/** An edition's seeds from a root: the root first, then its successors. Reproducible from the root alone. */
export function seedSeries(root: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => (i === 0 ? root : stepHash(root, i)));
}
