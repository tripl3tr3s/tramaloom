import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorState as State } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import type { Layer, LayerScript } from "@gridloom/core";
import { SCRIPT_API } from "@gridloom/core";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { compileInSandbox, SandboxError } from "../../sandbox/host.ts";
import { MAX_SCRIPT_CHARS } from "../../state/limits.ts";
import { parseScriptParams } from "../../state/schema.ts";
import { codeLook } from "./theme.ts";
import { useLang } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";

interface Props {
  /** A script layer (module "script", with its script). */
  readonly layer: Layer;
  /** The main view's last error, which includes errors thrown while the script draws. */
  readonly renderError: string | null;
  /** False while the code came from elsewhere and is not approved: it is shown but not run. */
  readonly running: boolean;
  readonly onApply: (layerId: string, script: LayerScript) => void;
  readonly onClose: () => void;
  /** Shown beside the code instead of the helper list: a lesson's current step. */
  readonly aside?: ReactNode;
}

type Status = { readonly kind: "ok" } | { readonly kind: "checking" } | { readonly kind: "error"; readonly message: string; readonly line: number | null };

/** Calls whose results can differ in the last digit between browsers, or that change every run. */
const RISKY: readonly { readonly pattern: RegExp; readonly advice: MessageKey }[] = [
  { pattern: /Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2)\b/, advice: "editor.riskTrig" },
  { pattern: /Math\.(?:exp|expm1|log1p|log2|log10|log|pow|cbrt|hypot)\b|\*\*/, advice: "editor.riskPow" },
  { pattern: /\bDate\b|performance\.now/, advice: "editor.riskTime" },
];

/** Determinism warnings, one per line at most. Comments are skipped. */
function warningsFor(code: string): readonly { readonly line: number; readonly token: string; readonly advice: MessageKey }[] {
  return code.split("\n").flatMap((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "");
    const hit = RISKY.find((r) => r.pattern.test(line));
    const token = hit ? (line.match(hit.pattern)?.[0] ?? "") : "";
    return hit ? [{ line: i + 1, token, advice: hit.advice }] : [];
  });
}

/** Line of the first syntax error, found by the editor's own parser (no code runs). */
function syntaxErrorLine(state: EditorState): number | null {
  const tree = ensureSyntaxTree(state, state.doc.length, 500);
  let at: number | null = null;
  tree?.iterate({
    enter: (n) => {
      if (at !== null) return false;
      if (n.type.isError) at = n.from;
      return undefined;
    },
  });
  return at === null ? null : state.doc.lineAt(at).number;
}

const HELPERS: readonly (readonly [string, MessageKey])[] = [
  ["addItems(scene, items)", "editor.hAddItems"],
  ["ctx.rng(\"name\")", "editor.hRng"],
  ["chance(rng, p), int(rng, a, b), shuffled(rng, list)", "editor.hChoices"],
  ["dsin(a), dcos(a), TAU", "editor.hTrig"],
  ["makeNoise2D(rng)", "editor.hNoise"],
  ["scene.cells, scene.frame", "editor.hCells"],
  ["scene.palette.colors", "editor.hPalette"],
  ["{ type: \"rect\" | \"circle\" | \"polyline\" | \"dots\" }", "editor.hShapes"],
];

/**
 * Edits a script layer's code. Half a second after typing stops, the code is checked: syntax
 * here, then its top level in the sandbox, then the params it declares. Only code that passes
 * replaces the layer's script, so the last working version keeps drawing until then.
 */
export function ScriptEditor({ layer, running, renderError, onApply, onClose, aside }: Props) {
  const { t } = useLang();
  const script = layer.script;
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [code, setCode] = useState(script?.code ?? "");
  // The code the document holds: what was loaded, or last applied from here.
  const applied = useRef(script?.code ?? "");
  const [status, setStatus] = useState<Status>({ kind: "ok" });

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: State.create({
        doc: applied.current,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          javascript(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": t("editor.codeLabel") }),
          ...codeLook,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setCode(u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // The script changed from outside (undo, redo): show it, unless it is what was just applied here.
  const external = script?.code ?? "";
  useEffect(() => {
    const view = viewRef.current;
    if (!view || external === applied.current) return;
    applied.current = external;
    if (view.state.doc.toString() !== external) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: external } });
  }, [external]);

  useEffect(() => {
    if (code === applied.current) {
      setStatus((s) => (s.kind === "checking" ? { kind: "ok" } : s));
      return;
    }
    setStatus({ kind: "checking" });
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        if (code.length > MAX_SCRIPT_CHARS) {
          setStatus({ kind: "error", message: t("editor.tooLong", { max: MAX_SCRIPT_CHARS.toLocaleString("en") }), line: null });
          return;
        }
        try {
          const compiled = await compileInSandbox(code);
          if (!live) return;
          const params = parseScriptParams(compiled.params);
          if (!params.ok) {
            setStatus({ kind: "error", message: params.error, line: null });
            return;
          }
          applied.current = code;
          onApply(layer.id, { api: SCRIPT_API, label: compiled.label, code, params: params.params });
          setStatus({ kind: "ok" });
        } catch (err) {
          if (!live) return;
          const state = viewRef.current?.state;
          const syntaxLine = state ? syntaxErrorLine(state) : null;
          const line = err instanceof SandboxError ? (err.line ?? syntaxLine) : syntaxLine;
          setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err), line });
        }
      })();
    }, 500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code, layer.id, onApply]);

  const goTo = (line: number) => {
    const view = viewRef.current;
    if (!view) return;
    const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
    view.focus();
  };

  const warnings = warningsFor(code);
  // Errors thrown while drawing come back through the main view.
  const drawError = status.kind === "ok" && renderError?.startsWith("Script") ? renderError : null;
  const drawLine = drawError ? Number(/line (\d+)/.exec(drawError)?.[1] ?? 0) || null : null;

  return (
    <section aria-label={t("editor.codeOf", { label: script?.label ?? "Script" })} className="flex h-[45%] min-h-56 shrink-0 flex-col border-t border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
          {t("editor.title", { label: script?.label ?? "Script" })}
          <span className="ml-2 font-normal text-zinc-500">{t("editor.live")}</span>
        </h2>
        <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
          {t("common.close")}
        </button>
      </div>
      {/* A lesson sits beside the code on wide screens and above it on narrow ones. */}
      <div className={`flex min-h-0 flex-1 ${aside ? "flex-col-reverse lg:flex-row" : ""}`}>
        <div ref={host} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
        {aside ? (
          <div className="panel-scroll max-h-44 shrink-0 overflow-y-auto border-b border-zinc-800 px-3 py-2 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-l">{aside}</div>
        ) : (
          <details className="panel-scroll hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-800 px-3 py-2 text-[11px] leading-snug text-zinc-400 lg:block" open>
          <summary className="cursor-pointer select-none font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">{t("editor.helpers")}</summary>
          <dl className="mt-2 flex flex-col gap-1.5">
            {HELPERS.map(([name, what]) => (
              <div key={name}>
                <dt className="font-mono text-zinc-200">{name}</dt>
                <dd>{t(what)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-zinc-500">{t("editor.helpersNote")}</p>
        </details>
        )}
      </div>
      <div className="border-t border-zinc-800 px-3 py-1.5 text-[11px]" role="status" aria-live="polite">
        {status.kind === "checking" && <p className="text-zinc-500">{t("editor.checking")}</p>}
        {status.kind === "error" && (
          <p className="text-red-300">
            {status.line !== null && (
              <button type="button" className="mr-1.5 rounded bg-red-950 px-1.5 text-red-200 hover:bg-red-900" onClick={() => goTo(status.line ?? 1)}>
                {t("editor.line", { n: status.line ?? 1 })}
              </button>
            )}
            {status.message}
            <span className="text-zinc-500">{t("editor.keepsDrawing")}</span>
          </p>
        )}
        {drawError && (
          <p className="text-red-300">
            {drawLine !== null && (
              <button type="button" className="mr-1.5 rounded bg-red-950 px-1.5 text-red-200 hover:bg-red-900" onClick={() => goTo(drawLine)}>
                {t("editor.line", { n: drawLine })}
              </button>
            )}
            {drawError}
          </p>
        )}
        {status.kind === "ok" && !drawError && running && <p className="text-emerald-300/80">{t("editor.drawing")}</p>}
        {status.kind === "ok" && !running && <p className="text-amber-200/80">{t("editor.notRunning")}</p>}
        {warnings.slice(0, 3).map((w) => (
          <p key={w.line} className="text-amber-200/80">
            <button type="button" className="mr-1.5 rounded bg-amber-950/60 px-1.5 hover:bg-amber-900/60" onClick={() => goTo(w.line)}>
              {t("editor.line", { n: w.line })}
            </button>
            {t(w.advice, { token: w.token })}
          </p>
        ))}
      </div>
    </section>
  );
}
