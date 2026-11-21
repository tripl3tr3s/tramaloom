import type { Lang, Text } from "./lessons.ts";

const KEY = "gridloom.lessonLang";

/** The lessons' language: the last one chosen, else Spanish for a Spanish browser, else English. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // No storage: fall through to the browser's language.
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Private windows: the choice lasts for this visit.
  }
}

const t = (en: string, es: string): Text => ({ en, es });

/** The lesson panels' own words. The rest of the studio is in English for now. */
export const UI = {
  lessons: t("Lessons", "Lecciones"),
  intro: t(
    "Short lessons in writing your own layer. Each one adds a script layer to your piece and walks you through its code, one small change at a time. Nothing you have is changed.",
    "Lecciones cortas para escribir tu propia capa. Cada una agrega una capa de script a tu pieza y te guía por su código, un cambio pequeño a la vez. No se modifica nada de lo que ya tienes.",
  ),
  start: t("Start", "Empezar"),
  close: t("Close", "Cerrar"),
  step: t("Step", "Paso"),
  of: t("of", "de"),
  back: t("Back", "Atrás"),
  next: t("Next", "Siguiente"),
  done: t("Done", "Listo"),
  showMe: t("Show me", "Muéstrame"),
  showMeHint: t("Puts this step's finished code in the editor", "Pone en el editor el código terminado de este paso"),
  end: t("End lesson", "Terminar lección"),
  finished: t(
    "Lesson done. The layer is yours: keep changing it, or start another lesson from Learn.",
    "Lección terminada. La capa es tuya: sigue cambiándola, o empieza otra lección desde Aprender.",
  ),
  language: t("Language", "Idioma"),
} as const;
