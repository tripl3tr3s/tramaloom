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
