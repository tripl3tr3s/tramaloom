/**
 * Turns a built-in module's TypeScript source into a script layer's JavaScript, keeping every
 * comment and line as written. The editor's own parser finds the TypeScript-only parts (types,
 * interfaces, imports); only those spans are cut. This edits text and never runs it.
 */
import { parser } from "@lezer/javascript";

const ts = parser.configure({ dialect: "ts" });

/** Node types that exist only in TypeScript and can be cut whole. */
const CUT = new Set(["TypeAnnotation", "TypeParamList", "InterfaceDeclaration", "TypeAliasDeclaration"]);

type Range = readonly [number, number];

/** Start of the whitespace (not newlines) right before `at`. */
const spaceBefore = (src: string, at: number): number => {
  let i = at;
  while (i > 0 && (src[i - 1] === " " || src[i - 1] === "\t")) i--;
  return i;
};

/** End of a whole-line statement: past its trailing newline. */
const lineEnd = (src: string, at: number): number => (src[at] === "\n" ? at + 1 : at);

function cuts(src: string): Range[] {
  const out: Range[] = [];
  ts.parse(src).iterate({
    enter: (n) => {
      const name = n.name;
      if (name === "ImportDeclaration") {
        out.push([n.from, lineEnd(src, n.to)]);
        return false;
      }
      if (name === "ExportDeclaration") {
        const decl = n.node.firstChild?.nextSibling;
        // export interface / export type: the whole statement goes.
        if (decl && (decl.name === "InterfaceDeclaration" || decl.name === "TypeAliasDeclaration")) {
          out.push([n.from, lineEnd(src, n.to)]);
          return false;
        }
        // Otherwise keep the declaration and drop the keyword (a script exports nothing).
        out.push([n.from, n.from + "export ".length]);
        return undefined;
      }
      if (CUT.has(name)) {
        const statement = name === "InterfaceDeclaration" || name === "TypeAliasDeclaration";
        out.push(statement ? [n.from, lineEnd(src, n.to)] : [n.from, n.to]);
        return false;
      }
      // Type arguments of an expression, as in new Map<number, string>().
      if (name === "TypeArgList" && n.node.parent?.name === "InstantiationExpression") {
        out.push([n.from, n.to]);
        return false;
      }
      // x as T, x as const, x satisfies T: keep x.
      if (name === "BinaryExpression") {
        const op = n.node.getChild("as") ?? n.node.getChild("satisfies");
        if (op) out.push([spaceBefore(src, op.from), n.to]);
      }
      return undefined;
    },
  });
  return out;
}

/** Removes the ranges (nested ones fold into the outer one). */
function cut(src: string, ranges: readonly Range[]): string {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let out = "";
  let at = 0;
  for (const [from, to] of sorted) {
    if (from < at) continue;
    out += src.slice(at, from);
    at = to;
  }
  return out + src.slice(at);
}

/**
 * The script for a built-in module: its own code, as JavaScript, calling layer(...) instead of
 * defineModule(...), labelled "<label> remix". Throws when the source has an unexpected shape.
 */
export function remixSource(source: string, moduleId: string, label: string): string {
  const js = cut(source, cuts(source));
  const head = new RegExp(`const \\w+Module = defineModule\\(`);
  if (!head.test(js)) throw new Error(`The ${moduleId} module's code has an unexpected shape`);
  const body = js.replace(head, "layer(");
  // The layer's own label is the first one after layer(.
  const start = body.indexOf("layer(");
  const relabelled = body.slice(0, start) + body.slice(start).replace(/label: "[^"]*"/, `label: ${JSON.stringify(`${label} remix`.slice(0, 40))}`);
  const header = [
    `// A remix of the built-in ${label} layer: its own code, now yours to change.`,
    "// It draws exactly like the original until you edit it. The helpers it imported",
    "// (addItems, dsin, makeNoise2D and the rest) are available to every script.",
    "",
  ].join("\n");
  return header + relabelled.replace(/^\s*\n/, "").replace(/\n{3,}/g, "\n\n");
}
