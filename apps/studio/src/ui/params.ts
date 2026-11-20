import type { ParamSetting, ParamSpec } from "@gridloom/core";

/** True when the setting draws exactly what the module default draws: nothing to reset. */
export function isDefaultSetting(spec: ParamSpec, setting: ParamSetting | undefined): boolean {
  if (!setting) return true;
  return setting.vary === undefined && setting.locked !== true && setting.value === spec.default;
}
