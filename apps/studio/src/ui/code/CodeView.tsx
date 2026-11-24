import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import type { LayerScript } from "@tramaloom/core";
import { defaultRegistry, getModule, SCRIPT_API } from "@tramaloom/core";
import type { ReactNode } from "react";
import { parseScriptParams } from "../../state/schema.ts";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "../../hooks/useDialog.ts";
import { loadModuleSource } from "./moduleSource.ts";
import { remixLabel, remixSource } from "./remix.ts";
import { codeLook } from "./theme.ts";
import { useLang } from "../../i18n/i18n.tsx";
import { errorText } from "../../i18n/errors.ts";

interface Props {
  readonly moduleId: string;
  /** Offered for drawing layers: turns the layer into a script layer with this code. */
  readonly onRemix?: (script: LayerScript) => void;
  /** The name the layer stack shows, for the title. */
  readonly label: string;
  readonly onClose: () => void;
  readonly notify: (msg: string) => void;
}

/**
 * Read-only source of the module behind a layer, with a short guide to reading it.
 * The first rung of learning to code here: every built-in look is a small, commented file.
 */
export function CodeView({ moduleId, label, onClose, notify, onRemix }: Props) {
  const { lang, t } = useLang();
  /** A sentence with `backticks` shown as code. Text only, never HTML. */
  const prose = (text: string) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 === 1 ? <Code key={i}>{part}</Code> : part));
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  });
  const host = useRef<HTMLDivElement | null>(null);
  // undefined while loading, null when there is no source for this module.
  const [source, setSource] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSource(undefined);
    loadModuleSource(moduleId).then(
      (s) => live && setSource(s),
      () => live && setSource(null),
    );
    return () => {
      live = false;
    };
  }, [moduleId]);

  useEffect(() => {
    if (!source || !host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: source,
        extensions: [
          lineNumbers(),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": t("code.sourceOf", { label }) }),
          javascript({ typescript: true }),
          ...codeLook,
        ],
      }),
    });
    return () => view.destroy();
  }, [source, label, t]);

  const remix = () => {
    const def = getModule(defaultRegistry, moduleId);
    if (!source || !def || !onRemix) return;
    try {
      const code = remixSource(source, moduleId, label, lang);
      // The module's own params, as data: the same settings keep the same values.
      const params = parseScriptParams(JSON.parse(JSON.stringify(def.params)));
      if (!params.ok) throw new Error(params.error);
      onRemix({ api: SCRIPT_API, label: remixLabel(label, lang), code, params: params.params });
    } catch (err) {
      notify(t("code.remixFailed", { label, error: errorText(err, t) }));
    }
  };

  const copy = () => {
    if (!source) return;
    navigator.clipboard.writeText(source).then(
      () => notify(t("code.copied")),
      () => notify(t("code.copyFailed")),
    );
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 max-md:fixed max-md:p-0" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-title"
        className="flex h-full max-h-[52rem] w-full max-w-4xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 outline-none max-md:max-h-none max-md:rounded-none max-md:border-0"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
          <h2 id="code-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {t("code.howDraws", { label })}
          </h2>
          {onRemix && (
            <button
              type="button"
              className="rounded bg-sky-700 px-2 py-0.5 text-xs text-white hover:bg-sky-600 disabled:opacity-30"
              onClick={remix}
              disabled={!source}
              title={t("code.remixHint")}
            >
              {t("code.remix")}
            </button>
          )}
          <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30" onClick={copy} disabled={!source}>
            {t("code.copy")}
          </button>
          <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <details open className="group border-b border-zinc-800 px-4 py-2 text-xs leading-relaxed text-zinc-300">
          <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">{t("code.howToRead")}</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 marker:text-zinc-600">
            <li>{prose(t("code.read1"))}</li>
            <li>{prose(t("code.read2"))}</li>
            <li>{prose(t("code.read3"))}</li>
            <li>{prose(t("code.read4"))}</li>
          </ul>
          <p className="mt-2 text-zinc-400">{prose(t("code.readTs"))}</p>
        </details>

        <div className="min-h-0 flex-1 overflow-hidden px-1 py-1">
          {source === undefined && <p className="p-3 text-xs text-zinc-500">{t("code.loading")}</p>}
          {source === null && <p className="p-3 text-xs text-zinc-400">{t("code.none")}</p>}
          <div ref={host} className={source ? "h-full" : "hidden"} />
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { readonly children: ReactNode }) {
  return <code className="rounded bg-zinc-800 px-1 py-px font-mono text-[11px] text-zinc-100">{children}</code>;
}
