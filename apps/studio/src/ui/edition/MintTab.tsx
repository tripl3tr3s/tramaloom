import type { ArtDocument } from "@gridloom/core";
import { generate, pixelSize } from "@gridloom/core";
import { assembleMint } from "@gridloom/runtime/assemble";
import modulesSource from "@gridloom/runtime/modules.json?raw";
import runtimeSource from "@gridloom/runtime/runtime.js?raw";
import { useMemo, useState } from "react";
import { download } from "../../render/export.ts";

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
const LICENCES = ["All rights reserved", "CC BY-NC 4.0", "CC BY 4.0", "CC0 1.0", "NFT licence 2.0"] as const;

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** The built player: the engine plus one script per module; a page takes only what its piece uses. */
const PLAYER = ((): { readonly engine: string; readonly modules: Readonly<Record<string, string>> } => {
  const parsed: unknown = JSON.parse(modulesSource);
  const modules =
    parsed && typeof parsed === "object" ? Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
  return { engine: runtimeSource, modules };
})();

/** Self-hosted release: one index.html with the player, the frozen document and its documentation. */
export function MintTab({ doc, hash, notify }: { readonly doc: ArtDocument; readonly hash: string; readonly notify: (m: string) => void }) {
  // Follows the piece's name until you type your own title.
  const [titleDraft, setTitle] = useState<string | null>(null);
  const title = titleDraft ?? doc.name;
  const [artist, setArtist] = useState("");
  const [licence, setLicence] = useState<string>(LICENCES[0]);

  const capture = useMemo(() => pixelSize(generate(doc, hash).scene, 2000), [doc, hash]);
  const html = useMemo(() => {
    try {
      return assembleMint(PLAYER, doc, { title, artist, licence, captureWidth: capture.width, captureHeight: capture.height });
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [doc, title, artist, licence, capture]);
  const bytes = typeof html === "string" ? new Blob([html]).size : 0;

  const blob = () => (typeof html === "string" ? new Blob([html], { type: "text/html;charset=utf-8" }) : null);
  const open = () => {
    const b = blob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    // Blob URLs cannot carry a query string, so the player also reads #hash=.
    window.open(`${url}#hash=${hash}`, "_blank", "noopener");
    // Long enough for the tab to load (and a reload or two); then free it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const save = () => {
    const b = blob();
    if (!b) return;
    // Hosts (IPFS, Arweave, static servers) look for exactly index.html.
    download(b, "index.html");
    notify(`Exported index.html for "${title || doc.name}"`);
  };

  return (
    <div className="space-y-3 text-xs text-zinc-300">
      <div className="grid max-w-xl grid-cols-[8rem_1fr] items-center gap-2">
        <label htmlFor="mint-title">Title</label>
        <input id="mint-title" className={field} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="mint-artist">Artist</label>
        <input id="mint-artist" className={field} value={artist} maxLength={100} onChange={(e) => setArtist(e.target.value)} placeholder="optional" />
        <label htmlFor="mint-licence">Artwork licence</label>
        <input id="mint-licence" className={field} list="mint-licences" value={licence} maxLength={100} onChange={(e) => setLicence(e.target.value)} />
        <datalist id="mint-licences">
          {LICENCES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40" onClick={save} disabled={typeof html !== "string"}>
          Export index.html
        </button>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700 disabled:opacity-40" onClick={open} disabled={typeof html !== "string"}>
          Preview with this seed
        </button>
        <span className="text-zinc-500">{typeof html === "string" ? `${kb(bytes)}, self-contained` : `Cannot export: ${html.message}`}</span>
      </div>
      <div className="max-w-2xl space-y-1.5 text-[11px] text-zinc-400">
        <p>
          One file holds the player (Gridloom engine, MIT), this document frozen as it is now, and a header documenting the seed format,
          traits and weights, licences and suggested capture size ({capture.width} x {capture.height}). It makes no network requests.
        </p>
        <p>
          The piece reads <code className="text-zinc-300">?hash=</code> (64 hex) and optional <code className="text-zinc-300">?width=</code>/
          <code className="text-zinc-300">?height=</code>, sets <code className="text-zinc-300">window.$features</code> before drawing, and fires{" "}
          <code className="text-zinc-300">genart:done</code> when the frame is complete.
        </p>
        <p className="text-amber-200/80">
          Freeze the rarity table before exporting: the file keeps the weights it was exported with. Test it with the network disabled, and
          host it somewhere permanent (IPFS with a pinning service you pay for, or Arweave); a personal domain is mortal.
        </p>
      </div>
    </div>
  );
}
