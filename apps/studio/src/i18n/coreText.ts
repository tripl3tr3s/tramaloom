/**
 * Module, setting, group, option and preset names in the studio's language. Core defines
 * them in English; Spanish comes from the tables in ./core. Anything missing (a script
 * layer's own settings, a module added later) falls back to the English it was given.
 */
import type { ParamSpec } from "@tramaloom/core";
import { useMemo } from "react";
import { GROUPS_ES, MODULES_ES, PRESETS_ES } from "./core/index.ts";
import type { Lang } from "./i18n.tsx";
import { useLang } from "./i18n.tsx";

export interface CoreText {
  readonly moduleLabel: (moduleId: string, english: string) => string;
  readonly moduleDescription: (moduleId: string, english: string) => string;
  /** The spec with its label and help in this language (options stay values; see optionLabel). */
  readonly spec: <S extends ParamSpec>(moduleId: string, name: string, spec: S) => S;
  readonly optionLabel: (moduleId: string, name: string, value: string) => string;
  readonly group: (english: string) => string;
  readonly presetName: (presetId: string, english: string) => string;
}

const ENGLISH: CoreText = {
  moduleLabel: (_m, en) => en,
  moduleDescription: (_m, en) => en,
  spec: (_m, _n, spec) => spec,
  optionLabel: (_m, _n, value) => value,
  group: (en) => en,
  presetName: (_p, en) => en,
};

const SPANISH: CoreText = {
  moduleLabel: (m, en) => MODULES_ES[m]?.label ?? en,
  moduleDescription: (m, en) => MODULES_ES[m]?.description ?? en,
  spec: (m, n, spec) => {
    const p = MODULES_ES[m]?.params[n];
    return p ? { ...spec, label: p.label, help: p.help } : spec;
  },
  optionLabel: (m, n, value) => MODULES_ES[m]?.params[n]?.options?.[value] ?? value,
  group: (en) => GROUPS_ES[en] ?? en,
  presetName: (p, en) => PRESETS_ES[p] ?? en,
};

export const coreText = (lang: Lang): CoreText => (lang === "es" ? SPANISH : ENGLISH);

export function useCoreText(): CoreText {
  const { lang } = useLang();
  return useMemo(() => coreText(lang), [lang]);
}
