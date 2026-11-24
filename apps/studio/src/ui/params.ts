import type { ParamSetting, ParamSpec, ParamSpecs } from "@tramaloom/core";

/** True when the setting draws exactly what the module default draws: nothing to reset. */
export function isDefaultSetting(spec: ParamSpec, setting: ParamSetting | undefined): boolean {
  if (!setting) return true;
  return setting.vary === undefined && setting.locked !== true && setting.value === spec.default;
}

export interface ParamSection {
  /** null: params without a group, shown first with no heading. */
  readonly title: string | null;
  readonly names: readonly string[];
}

/** Sections for the param panel: ungrouped params first, then each group in the order it first appears. */
export function groupParams(params: ParamSpecs): readonly ParamSection[] {
  const entries = Object.entries(params);
  const loose = entries.filter(([, spec]) => !spec.group).map(([name]) => name);
  const titles = [...new Set(entries.flatMap(([, spec]) => (spec.group ? [spec.group] : [])))];
  const grouped = titles.map((title) => ({ title, names: entries.filter(([, spec]) => spec.group === title).map(([name]) => name) }));
  return loose.length ? [{ title: null, names: loose }, ...grouped] : grouped;
}

/** Each option's chance of being drawn, 0 to 1, in option order. All zero when every weight is zero. */
export function weightShares(options: readonly string[], weights: Readonly<Record<string, number>>): readonly number[] {
  const ws = options.map((o) => Math.max(0, weights[o] ?? 0));
  const total = ws.reduce((a, b) => a + b, 0);
  return ws.map((w) => (total > 0 ? w / total : 0));
}

/** Weights are rewritten as whole numbers adding up to about this, so they read like percentages. */
const SHARE_TOTAL = 100;

/**
 * Weights that give `option` the chance `share` (0 to 1), for dragging its bar.
 * The other options keep their proportions to each other and share what is left;
 * when they are all zero they split it evenly. Everything becomes whole numbers
 * summing to about 100, and an option that had a chance keeps at least weight 1
 * while anything is left over, so a drag never silently drops an option.
 */
export function weightsForShare(
  options: readonly string[],
  weights: Readonly<Record<string, number>>,
  option: string,
  share: number,
): Readonly<Record<string, number>> {
  if (!options.includes(option) || options.length < 2) return weights;
  const s = Math.min(1, Math.max(0, share));
  const own = Math.round(s * SHARE_TOTAL);
  const rest = SHARE_TOTAL - own;
  const others = options.filter((o) => o !== option);
  const raw = others.map((o) => Math.max(0, weights[o] ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const base = sum > 0 ? raw : others.map(() => 1);
  const baseSum = sum > 0 ? sum : others.length;
  const scaled = base.map((w) => {
    if (rest === 0 || w === 0) return 0;
    return Math.max(1, Math.round((w / baseSum) * rest));
  });
  // Nothing left for the others and nothing taken: keep the option alive instead of all zeros.
  const ownWeight = own === 0 && scaled.every((w) => w === 0) ? 1 : own;
  return {
    ...weights,
    [option]: ownWeight,
    ...Object.fromEntries(others.map((o, i) => [o, scaled[i] ?? 0])),
  };
}

/**
 * Whether a setting applies, from its spec's showIf. A controlling setting that
 * varies (and is not locked) could take any value, so the setting stays visible.
 */
export function isRelevant(spec: ParamSpec, params: ParamSpecs, settings: Readonly<Record<string, ParamSetting | undefined>>): boolean {
  const cond = spec.showIf;
  if (!cond) return true;
  const target = params[cond.param];
  if (!target) return true;
  const s = settings[cond.param];
  if (s?.vary && s.locked !== true) return true;
  const value = s?.value ?? target.default;
  if (cond.is) return cond.is.includes(value);
  if (cond.not) return !cond.not.includes(value);
  return true;
}
