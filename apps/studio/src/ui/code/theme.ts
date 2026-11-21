import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

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

/** Colors and layout shared by the code viewer and the script editor. */
export const codeLook = [syntaxHighlighting(highlight), theme];
