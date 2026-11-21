import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "../../hooks/useDialog.ts";
import { loadModuleSource } from "./moduleSource.ts";

interface Props {
  readonly moduleId: string;
  /** The name the layer stack shows, for the title. */
  readonly label: string;
  readonly onClose: () => void;
  readonly notify: (msg: string) => void;
}

// Colors picked for at least 4.5:1 on the zinc-900 card. Types are muted: readers can skip them.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: "#7dd3fc" },
  { tag: [t.string, t.special(t.string)], color: "#fde68a" },
  { tag: [t.number, t.bool, t.null], color: "#86efac" },
  { tag: [t.lineComment, t.blockComment], color: "#a1a1aa", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#c4b5fd" },
  { tag: [t.typeName, t.namespace], color: "#71a5a0" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#e4e4e7" },
  { tag: [t.variableName, t.definition(t.variableName)], color: "#f4f4f5" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "#a1a1aa" },
]);

const theme = EditorView.theme(
  {
    "&": { height: "100%", fontSize: "12px", backgroundColor: "transparent", color: "#e4e4e7" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.6" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#71717a", border: "none" },
    ".cm-content": { caretColor: "#7dd3fc" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#0c4a6e !important" },
  },
  { dark: true },
);

/**
 * Read-only source of the module behind a layer, with a short guide to reading it.
 * The first rung of learning to code here: every built-in look is a small, commented file.
 */
export function CodeView({ moduleId, label, onClose, notify }: Props) {
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
          EditorView.contentAttributes.of({ "aria-label": `Source code of ${label}` }),
          javascript({ typescript: true }),
          syntaxHighlighting(highlight),
          theme,
        ],
      }),
    });
    return () => view.destroy();
  }, [source, label]);

  const copy = () => {
    if (!source) return;
    navigator.clipboard.writeText(source).then(
      () => notify("Code copied"),
      () => notify("Could not copy: select the code and copy it instead"),
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
            How {label} draws
          </h2>
          <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30" onClick={copy} disabled={!source}>
            Copy
          </button>
          <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            Close
          </button>
        </div>

        <details open className="group border-b border-zinc-800 px-4 py-2 text-xs leading-relaxed text-zinc-300">
          <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300">How to read it</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 marker:text-zinc-600">
            <li>
              <Code>params</Code> are the settings in the panel: <Code>label</Code> is the name you see, <Code>help</Code> is the text behind its <b>i</b> button, and <Code>min</Code>, <Code>max</Code> and <Code>default</Code> set up the slider.
            </li>
            <li>
              <Code>apply(scene, v, ctx)</Code> runs once for every picture. <Code>v</Code> holds the value each setting has for this seed: <Code>v.</Code> followed by the setting&apos;s name.
            </li>
            <li>
              <Code>ctx.rng(&quot;name&quot;)</Code> gives random numbers that the seed decides. The same seed always gives the same numbers, so the same picture.
            </li>
            <li>
              It returns the scene with new shapes added: <Code>rect</Code>, <Code>circle</Code>, <Code>polyline</Code> (lines, what a pen plotter draws) and <Code>dots</Code>. Positions are measured so that the short side of the canvas is 1.
            </li>
          </ul>
          <p className="mt-2 text-zinc-400">
            This is TypeScript: JavaScript plus type labels after a colon, such as <Code>cx: number</Code>. You can read past them.
          </p>
        </details>

        <div className="min-h-0 flex-1 overflow-hidden px-1 py-1">
          {source === undefined && <p className="p-3 text-xs text-zinc-500">Loading the code...</p>}
          {source === null && <p className="p-3 text-xs text-zinc-400">There is no code to show for this layer.</p>}
          <div ref={host} className={source ? "h-full" : "hidden"} />
        </div>
      </div>
    </div>
  );
}

function Code({ children }: { readonly children: ReactNode }) {
  return <code className="rounded bg-zinc-800 px-1 py-px font-mono text-[11px] text-zinc-100">{children}</code>;
}
