import type { LayerScript } from "@gridloom/core";
import { defaultRegistry, getModule, SCRIPT_API } from "@gridloom/core";
import { useState } from "react";
import { useDialog } from "../../hooks/useDialog.ts";
import { useLang } from "../../i18n/i18n.tsx";
import { parseScriptParams } from "../../state/schema.ts";
import { loadModuleSource } from "./moduleSource.ts";
import { remixSource } from "./remix.ts";
import { REMIXABLE } from "./remixLayer.ts";
import { blankScript, STARTER_SCRIPT } from "./starter.ts";

interface Props {
  /** Adds a script layer with this code. */
  readonly onCreate: (script: LayerScript) => void;
  readonly onLearn: () => void;
  readonly onClose: () => void;
}

const card = "flex w-full flex-col items-start gap-0.5 rounded-md border border-zinc-800 p-3 text-left hover:border-sky-600 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:opacity-40";

/** Where a new script layer starts: an example, a blank layer, a built-in layer's code, or the lessons. */
export function ScriptStart({ onCreate, onLearn, onClose }: Props) {
  const { lang, t } = useLang();
  const [view, setView] = useState<"choices" | "builtins">("choices");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (view === "builtins") setView("choices");
      else onClose();
    }
  });

  /** A built-in module's own code as a new script layer, with its default settings. */
  const fromBuiltIn = async (id: string) => {
    const def = getModule(defaultRegistry, id);
    if (!def) return;
    setBusy(id);
    setError(null);
    try {
      const source = await loadModuleSource(id);
      if (!source) throw new Error(t("code.none"));
      const params = parseScriptParams(JSON.parse(JSON.stringify(def.params)));
      if (!params.ok) throw new Error(params.error);
      onCreate({ api: SCRIPT_API, label: `${def.label} remix`.slice(0, 40), code: remixSource(source, id, def.label), params: params.params });
    } catch (err) {
      setError(t("code.remixFailed", { label: def.label, error: err instanceof Error ? err.message : String(err) }));
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 max-md:fixed max-md:p-0" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-start-title"
        lang={lang}
        className="flex max-h-full w-full max-w-xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 shadow-2xl shadow-black/60 outline-none max-md:h-full max-md:rounded-none max-md:border-0"
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <h2 id="script-start-title" className="flex-1 text-sm font-semibold text-white">
            {view === "choices" ? t("start.title") : t("start.builtinTitle")}
          </h2>
          {view === "builtins" && (
            <button type="button" className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => setView("choices")}>
              {t("lessons.back")}
            </button>
          )}
          <button type="button" className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <p className="px-4 pt-1 leading-relaxed text-zinc-400">{view === "choices" ? t("start.intro") : t("start.builtinIntro")}</p>
        <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {view === "choices" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className={card} onClick={onLearn}>
                <span className="font-semibold text-zinc-100">{t("start.learn")}</span>
                <span className="leading-snug text-zinc-400">{t("start.learnDesc")}</span>
              </button>
              <button type="button" className={card} onClick={() => setView("builtins")}>
                <span className="font-semibold text-zinc-100">{t("start.builtin")}</span>
                <span className="leading-snug text-zinc-400">{t("start.builtinDesc")}</span>
              </button>
              <button type="button" className={card} onClick={() => onCreate(STARTER_SCRIPT)}>
                <span className="font-semibold text-zinc-100">{t("start.rings")}</span>
                <span className="leading-snug text-zinc-400">{t("start.ringsDesc")}</span>
              </button>
              <button type="button" className={card} onClick={() => onCreate(blankScript(lang))}>
                <span className="font-semibold text-zinc-100">{t("start.blank")}</span>
                <span className="leading-snug text-zinc-400">{t("start.blankDesc")}</span>
              </button>
            </div>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {[...REMIXABLE].map((id) => {
                const def = getModule(defaultRegistry, id);
                if (!def) return null;
                return (
                  <li key={id}>
                    <button type="button" className={card} disabled={busy !== null} onClick={() => void fromBuiltIn(id)}>
                      <span className="font-semibold text-zinc-100">{def.label}</span>
                      <span className="leading-snug text-zinc-400">{def.description}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="mt-3 text-red-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
