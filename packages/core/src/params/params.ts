import type { Rng } from "../prng/prng.ts";
import { gaussian, skewHigh, skewLow, weighted } from "../prng/distributions.ts";

/**
 * Param descriptors drive both generation and the auto-generated UI.
 * A param is either fixed (value) or variable (vary): the hash resolves it.
 */

interface Base {
  readonly label: string;
  readonly help?: string;
}
export interface NumberSpec extends Base {
  readonly kind: "number";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}
export interface IntSpec extends Base {
  readonly kind: "int";
  readonly min: number;
  readonly max: number;
  readonly default: number;
}
export interface EnumSpec<O extends string = string> extends Base {
  readonly kind: "enum";
  readonly options: readonly O[];
  readonly default: O;
}
export interface BoolSpec extends Base {
  readonly kind: "bool";
  readonly default: boolean;
}
export interface ColorSpec extends Base {
  readonly kind: "color";
  readonly default: string;
}

export type ParamSpec = NumberSpec | IntSpec | EnumSpec | BoolSpec | ColorSpec;
export type ParamSpecs = Readonly<Record<string, ParamSpec>>;
export type ParamValue = number | string | boolean;

export type ValueOf<S extends ParamSpec> = S extends NumberSpec | IntSpec
  ? number
  : S extends EnumSpec<infer O>
    ? O
    : S extends BoolSpec
      ? boolean
      : string;

export type ValuesOf<P extends ParamSpecs> = { readonly [K in keyof P]: ValueOf<P[K]> };

export type Distribution = "uniform" | "low" | "high" | "gaussian";

export type Variation =
  | { readonly kind: "range"; readonly min: number; readonly max: number; readonly dist: Distribution }
  | { readonly kind: "weights"; readonly weights: Readonly<Record<string, number>> };

export interface ParamSetting {
  readonly value: ParamValue;
  readonly vary?: Variation;
  /** Locked params ignore `vary` (used by mutation and reroll). */
  readonly locked?: boolean;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

function unit(r: Rng, dist: Distribution): number {
  switch (dist) {
    case "uniform":
      return r();
    case "low":
      return skewLow(r);
    case "high":
      return skewHigh(r);
    case "gaussian":
      return clamp(0.5 + gaussian(r) * 0.18, 0, 0.999999);
  }
}

function coerceFixed(spec: ParamSpec, value: ParamValue | undefined): ParamValue {
  switch (spec.kind) {
    case "number":
    case "int": {
      const n = typeof value === "number" && Number.isFinite(value) ? value : spec.default;
      const c = clamp(n, spec.min, spec.max);
      return spec.kind === "int" ? Math.round(c) : c;
    }
    case "enum":
      return typeof value === "string" && spec.options.includes(value) ? value : spec.default;
    case "bool":
      return typeof value === "boolean" ? value : spec.default;
    case "color":
      return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : spec.default;
  }
}

/** Ordered candidate keys for weighted draws; order must never depend on object key order. */
function weightKeys(spec: ParamSpec, weights: Readonly<Record<string, number>>): readonly string[] {
  if (spec.kind === "enum") return spec.options;
  if (spec.kind === "bool") return ["false", "true"];
  return Object.keys(weights).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function fromKey(spec: ParamSpec, key: string): ParamValue {
  if (spec.kind === "bool") return key === "true";
  if (spec.kind === "number" || spec.kind === "int") return Number(key);
  return key;
}

/** Resolve one param. `rng` must be a dedicated sub-stream for this param. */
export function resolveParam(spec: ParamSpec, setting: ParamSetting | undefined, rng: Rng): ParamValue {
  const fixed = coerceFixed(spec, setting?.value);
  const vary = setting?.vary;
  if (!vary || setting?.locked) return fixed;

  if (vary.kind === "range" && (spec.kind === "number" || spec.kind === "int")) {
    const lo = clamp(Math.min(vary.min, vary.max), spec.min, spec.max);
    const hi = clamp(Math.max(vary.min, vary.max), spec.min, spec.max);
    const u = unit(rng, vary.dist);
    if (spec.kind === "int") return Math.min(hi, Math.floor(lo + u * (hi - lo + 1)));
    const raw = lo + u * (hi - lo);
    const snapped = lo + Math.round((raw - lo) / spec.step) * spec.step;
    return clamp(Number(snapped.toFixed(6)), lo, hi);
  }

  if (vary.kind === "weights") {
    const entries = weightKeys(spec, vary.weights)
      .map((k) => [k, vary.weights[k] ?? 0] as const)
      .filter(([, w]) => w > 0);
    if (entries.length === 0) return fixed;
    return coerceFixed(spec, fromKey(spec, weighted(rng, entries)));
  }

  return fixed;
}
