import type { ArtDocument } from "@gridloom/core";
import { defaultRegistry, ENGINE_VERSION, expectedDistribution } from "@gridloom/core";

export interface MintMeta {
  readonly title: string;
  readonly artist: string;
  /** Licence of the artwork (the code is MIT). */
  readonly licence: string;
  /** Suggested capture size, recorded for posterity. */
  readonly captureWidth: number;
  readonly captureHeight: number;
}

const MAX_META = 200;

/** The built player: the engine, and one script per module (dist/runtime.js and dist/modules.json). */
export interface Player {
  readonly engine: string;
  readonly modules: Readonly<Record<string, string>>;
}

/** Modules the piece's enabled layers use, in stack order (so the bytes never depend on anything else). Hidden layers are never drawn. */
export function modulesUsed(doc: ArtDocument): readonly string[] {
  return [...new Set(doc.layers.filter((l) => l.enabled).map((l) => l.module))];
}

/** Cut by code points, so a surrogate pair is never split. */
const cut = (s: string, n: number): string => Array.from(s).slice(0, n).join("");

/** Text safe inside an HTML comment: no "--", no closing marker, no control characters. */
function commentSafe(s: string, limit = MAX_META): string {
  return cut(s, limit)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/[<>]/g, "");
}

/** Entity-escape markup characters and everything outside ASCII, so the bytes never depend on a charset guess. */
function htmlEscape(s: string): string {
  return Array.from(cut(s, MAX_META), (c) => (/[&<>"']|[^\x20-\x7e]/.test(c) ? `&#${c.codePointAt(0)};` : c)).join("");
}

/** JSON that cannot close the surrounding <script> or open a comment. */
function scriptSafeJson(value: unknown): string {
  // Everything outside printable ASCII becomes \\uXXXX too: the embedded document then
  // decodes identically whatever charset the browser assumes.
  return JSON.stringify(value).replace(/[<>&]|[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * The runtime is pasted raw into a <script>. "</script" would close it, and
 * "<!--" with "<script" switches the HTML parser into a state where it would not close.
 */
export function scriptSafeCode(code: string): string {
  if (/<\/script|<!--|<script/i.test(code)) throw new Error("runtime contains markup that would break its <script> element");
  return code;
}

function traitTable(doc: ArtDocument): string[] {
  return (doc.traits ?? []).map((t) => {
    const e = expectedDistribution(doc, t, defaultRegistry);
    const shares = e
      ? Object.entries(e.shares)
          .map(([k, p]) => `${k} ${(p * 100).toFixed(1)}%`)
          .join(", ")
      : "continuous";
    // Never truncated: the full table is the record of the weights used.
    return commentSafe(`  ${t.name} (${t.layerId}.${t.param}${e && !e.exact ? ", approximate" : ""}): ${shares}`, 100_000);
  });
}

/**
 * Build the single self-contained index.html for a self-hosted release.
 * Pure: the same inputs always give the same bytes.
 */
export function assembleMint(player: Player, doc: ArtDocument, meta: MintMeta): string {
  const moduleScripts = modulesUsed(doc).map((id) => {
    const code = Object.hasOwn(player.modules, id) ? player.modules[id] : undefined;
    if (code === undefined) throw new Error(`no player code for module "${id}" (unknown module, or @gridloom/runtime needs a rebuild)`);
    return `<script>${scriptSafeCode(code)}</script>`;
  });
  const title = meta.title.trim() || doc.name || "Untitled";
  const table = traitTable(doc);
  const header = [
    `${commentSafe(title)}${meta.artist.trim() ? ` by ${commentSafe(meta.artist.trim())}` : ""}`,
    "",
    `Artwork licence: ${commentSafe(meta.licence.trim() || "All rights reserved")}`,
    "Player code: Gridloom (MIT), https://opensource.org/license/mit",
    `Gridloom engine: v${ENGINE_VERSION}`,
    "",
    "Seed: ?hash= (or #hash=) with 64 hex characters, optional 0x prefix.",
    "      Without one, a random seed is chosen and written into the address bar.",
    "Size: ?width= or ?height= in pixels fixes that side (the other follows the aspect); both together",
    "      fit the piece inside that box. Without them it fits the window. Capped at 8192 px a side",
    "      and 16.7 megapixels, which every current browser can draw.",
    `Suggested capture: ${Math.round(meta.captureWidth)} x ${Math.round(meta.captureHeight)} px.`,
    "Signals: window.$features (traits, set before rendering), window.render(hash),",
    "         window.rendered and a 'genart:done' event once per seed when its frame is complete",
    "         (window resizes redraw without firing it again).",
    "Errors: an invalid seed sets window.gridloomError and fires 'genart:error'.",
    "Extras: window.gridloom.svg() returns the current piece as SVG.",
    "Works offline: no network requests. Target: current Chrome, Firefox and Safari.",
    "",
    "Traits and the weights used (expected share over a large edition):",
    ...(table.length ? table : ["  none declared"]),
  ];
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    // First, well inside the 1024 bytes browsers scan for the encoding.
    '<meta charset="utf-8">',
    `<!--\n${header.join("\n")}\n-->`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // No network, ever: blocks fetches, remote scripts, styles, fonts and images.
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'">`,
    `<title>${htmlEscape(title)}</title>`,
    "<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;overflow:hidden;background:#111}canvas{display:block}</style>",
    "</head>",
    "<body>",
    `<script id="gridloom-document" type="application/json">${scriptSafeJson(doc)}</script>`,
    `<script>${scriptSafeCode(player.engine)}</script>`,
    // Only the modules this piece uses; each registers itself with the engine above.
    ...moduleScripts,
    "<script>GridloomRuntime.start()</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
