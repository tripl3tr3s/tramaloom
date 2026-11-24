/**
 * The studio's language: English or Spanish. One choice, remembered per browser, for the
 * whole interface and the lessons. Module, setting and preset names come from core in English
 * and are shown in Spanish through ./coreText.ts (display only: documents keep the English ids).
 */
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MessageKey } from "./messages.ts";
import { MESSAGES } from "./messages.ts";

export type Lang = "en" | "es";
export type Vars = Readonly<Record<string, string | number>>;

const KEY = "tramaloom.lang";
// The lessons' own setting, from before the whole studio could switch.
const OLD_KEY = "tramaloom.lessonLang";

/** The last choice, else Spanish for a Spanish browser, else English. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // No storage: fall through to the browser's language.
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function save(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Private windows: the choice lasts for this visit.
  }
}

/** A message in a language, with {name} placeholders filled in. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text: string = MESSAGES[lang][key];
  return vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : all)) : text;
}

interface LangValue {
  readonly lang: Lang;
  readonly setLang: (lang: Lang) => void;
  readonly t: (key: MessageKey, vars?: Vars) => string;
}

const LangContext = createContext<LangValue>({ lang: "en", setLang: () => undefined, t: (k, v) => translate("en", k, v) });

export function LangProvider({ children }: { readonly children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    save(l);
    setState(l);
  }, []);
  const value = useMemo<LangValue>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = (): LangValue => useContext(LangContext);
