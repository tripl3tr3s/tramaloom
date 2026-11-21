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
const RISKY: readonly { readonly pattern: RegExp; readonly advice: string }[] = [
  { pattern: /Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2)\b/, advice: "can differ slightly between browsers, which can change the picture. Use dsin and dcos (with TAU) instead." },
  { pattern: /Math\.(?:exp|expm1|log1p|log2|log10|log|pow|cbrt|hypot)\b|\*\*/, advice: "can differ slightly between browsers. Multiply instead (x * x), or use Math.sqrt, which is exact." },
  { pattern: /\bDate\b|performance\.now/, advice: "changes on every run, so the same seed would not give back the same picture." },
];

/** Determinism warnings, one per line at most. Comments are skipped. */
function warningsFor(code: string): readonly { readonly line: number; readonly text: string }[] {
  return code.split("\n").flatMap((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "");
    const hit = RISKY.find((r) => r.pattern.test(line));
    const token = hit ? (line.match(hit.pattern)?.[0] ?? "") : "";
    return hit ? [{ line: i + 1, text: `${token} ${hit.advice}` }] : [];
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

const HELPERS: readonly (readonly [string, string])[] = [
  ["addItems(scene, items)", "the scene with your shapes added; return it from apply"],
  ["ctx.rng(\"name\")", "a seeded random function: call it for numbers from 0 to 1"],
  ["chance(rng, p), int(rng, a, b), shuffled(rng, list)", "common random choices"],
  ["dsin(a), dcos(a), TAU", "sine and cosine that match in every browser; TAU is a full turn"],
  ["makeNoise2D(rng)", "smooth noise: noise(x, y) gives 0 to 1"],
  ["scene.cells, scene.frame", "grid cells and the drawing area, as { x, y, w, h }"],
  ["scene.palette.colors", "the current palette's colors (null without a Palette layer)"],
  ["{ type: \"rect\" | \"circle\" | \"polyline\" | \"dots\" }", "shapes, with fill, stroke, strokeWidth and opacity"],
];

/**
 * Edits a script layer's code. Half a second after typing stops, the code is checked: syntax
 * here, then its top level in the sandbox, then the params it declares. Only code that passes
 * replaces the layer's script, so the last working version keeps drawing until then.
 */
export function ScriptEditor({ layer, running, renderError, onApply, onClose, aside }: Props) {
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
          EditorView.contentAttributes.of({ "aria-label": "Script code" }),
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
          setStatus({ kind: "error", message: `The script is longer than ${MAX_SCRIPT_CHARS.toLocaleString("en")} characters`, line: null });
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
    <section aria-label={`Code of ${script?.label ?? "Script"}`} className="flex h-[45%] min-h-56 shrink-0 flex-col border-t border-zinc-800 bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-white">
          Code: {script?.label ?? "Script"}
          <span className="ml-2 font-normal text-zinc-500">redraws as you type</span>
        </h2>
        <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
          Close
        </button>
      </div>
      {/* A lesson sits beside the code on wide screens and above it on narrow ones. */}
      <div className={`flex min-h-0 flex-1 ${aside ? "flex-col-reverse lg:flex-row" : ""}`}>
        <div ref={host} className="min-h-0 min-w-0 flex-1 overflow-hidden" />
        {aside ? (
          <div className="panel-scroll max-h-44 shrink-0 overflow-y-auto border-b border-zinc-800 px-3 py-2 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-l">{aside}</div>
        ) : (
          <details className="panel-scroll hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-800 px-3 py-2 text-[11px] leading-snug text-zinc-400 lg:block" open>
          <summary className="cursor-pointer select-none font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">Helpers</summary>
          <dl className="mt-2 flex flex-col gap-1.5">
            {HELPERS.map(([name, what]) => (
              <div key={name}>
                <dt className="font-mono text-zinc-200">{name}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-zinc-500">Math.random works too: it follows the seed. Press Esc, then Tab, to leave the editor with the keyboard.</p>
        </details>
        )}
      </div>
      <div className="border-t border-zinc-800 px-3 py-1.5 text-[11px]" role="status" aria-live="polite">
        {status.kind === "checking" && <p className="text-zinc-500">Checking...</p>}
        {status.kind === "error" && (
          <p className="text-red-300">
            {status.line !== null && (
              <button type="button" className="mr-1.5 rounded bg-red-950 px-1.5 text-red-200 hover:bg-red-900" onClick={() => goTo(status.line ?? 1)}>
                Line {status.line}
              </button>
            )}
            {status.message}
            <span className="text-zinc-500"> The last working version keeps drawing.</span>
          </p>
        )}
        {drawError && (
          <p className="text-red-300">
            {drawLine !== null && (
              <button type="button" className="mr-1.5 rounded bg-red-950 px-1.5 text-red-200 hover:bg-red-900" onClick={() => goTo(drawLine)}>
                Line {drawLine}
              </button>
            )}
            {drawError}
          </p>
        )}
        {status.kind === "ok" && !drawError && running && <p className="text-emerald-300/80">Drawing with this code.</p>}
        {status.kind === "ok" && !running && <p className="text-amber-200/80">Not running: this code came with the piece. Read it, then choose Run the code above, or edit it to make it yours.</p>}
        {warnings.slice(0, 3).map((w) => (
          <p key={w.line} className="text-amber-200/80">
            <button type="button" className="mr-1.5 rounded bg-amber-950/60 px-1.5 hover:bg-amber-900/60" onClick={() => goTo(w.line)}>
              Line {w.line}
            </button>
            {w.text}
          </p>
        ))}
      </div>
    </section>
  );
}
