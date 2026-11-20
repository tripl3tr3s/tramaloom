import type { ParamSetting, ParamSpec, ParamSpecs } from "@gridloom/core";

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
