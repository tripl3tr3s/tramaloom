import type { ArtDocument } from "@tramaloom/core";
import { generate, pixelSize, SCRIPT_MODULE } from "@tramaloom/core";
import { assembleMint } from "@tramaloom/runtime/assemble";
import modulesSource from "@tramaloom/runtime/modules.json?raw";
import runtimeSource from "@tramaloom/runtime/runtime.js?raw";
import scriptsSource from "@tramaloom/runtime/scripts.js?raw";
import { useMemo, useState } from "react";
import { download } from "../../render/export.ts";
import { unapprovedCode, useTrustVersion } from "../../sandbox/trust.ts";
import { useLang } from "../../i18n/i18n.tsx";

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
const LICENCES = ["All rights reserved", "CC BY-NC 4.0", "CC BY 4.0", "CC0 1.0", "NFT licence 2.0"] as const;

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** The built player: the engine, one script per module and the script compiler; a page takes only what its piece uses. */
const PLAYER = ((): { readonly engine: string; readonly modules: Readonly<Record<string, string>>; readonly scripts: string } => {
  const parsed: unknown = JSON.parse(modulesSource);
  const modules =
    parsed && typeof parsed === "object" ? Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
  return { engine: runtimeSource, modules, scripts: scriptsSource };
})();

/** Self-hosted release: one index.html with the player, the frozen document and its documentation. */
export function MintTab({ doc, hash, notify }: { readonly doc: ArtDocument; readonly hash: string; readonly notify: (m: string) => void }) {
  const { t } = useLang();
  // Follows the piece's name until you type your own title.
  const [titleDraft, setTitle] = useState<string | null>(null);
  const title = titleDraft ?? doc.name;
  const [artist, setArtist] = useState("");
  const [licence, setLicence] = useState<string>(LICENCES[0]);

  // The size comes from the Canvas layer alone, so script layers (drawn only in the sandbox) are left out.
  const capture = useMemo(() => pixelSize(generate({ ...doc, layers: doc.layers.filter((l) => l.module !== SCRIPT_MODULE) }, hash).scene, 2000), [doc, hash]);
  // A minted piece runs its code for every collector: only code this person wrote or approved.
  const trust = useTrustVersion();
  // Hidden layers count too: the page carries the whole document, code included.
  const waiting = useMemo(() => unapprovedCode(doc).length, [doc, trust]);
  const html = useMemo(() => {
    if (waiting > 0) return new Error(t("mint.unapproved"));
    try {
      return assembleMint(PLAYER, doc, { title, artist, licence, captureWidth: capture.width, captureHeight: capture.height });
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [doc, title, artist, licence, capture, waiting, t]);
  const bytes = typeof html === "string" ? new Blob([html]).size : 0;

  const blob = () => (typeof html === "string" ? new Blob([html], { type: "text/html;charset=utf-8" }) : null);
  // The preview page shows the piece in a sandboxed frame, so its code never runs with the studio's origin.
  const open = () => {
    if (typeof html !== "string") return;
    const preview = window.open(new URL("preview.html", document.baseURI).href, "_blank");
    if (!preview) return notify(t("mint.popups"));
    const onReady = (e: MessageEvent) => {
      if (e.source !== preview || e.origin !== location.origin || (e.data as { kind?: unknown } | null)?.kind !== "tramaloom-preview-ready") return;
      window.removeEventListener("message", onReady);
      preview.postMessage({ html, hash }, location.origin);
    };
    window.addEventListener("message", onReady);
    setTimeout(() => window.removeEventListener("message", onReady), 60_000);
  };
  const save = () => {
    const b = blob();
    if (!b) return;
    // Hosts (IPFS, Arweave, static servers) look for exactly index.html.
    download(b, "index.html");
    notify(t("mint.exported", { title: title || doc.name }));
  };

  return (
    <div className="space-y-3 text-xs text-zinc-300">
      <div className="grid max-w-xl grid-cols-[8rem_1fr] items-center gap-2">
        <label htmlFor="mint-title">{t("mint.title")}</label>
        <input id="mint-title" className={field} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="mint-artist">{t("mint.artist")}</label>
        <input id="mint-artist" className={field} value={artist} maxLength={100} onChange={(e) => setArtist(e.target.value)} placeholder={t("mint.optional")} />
        <label htmlFor="mint-licence">{t("mint.licence")}</label>
        <input id="mint-licence" className={field} list="mint-licences" value={licence} maxLength={100} onChange={(e) => setLicence(e.target.value)} />
        <datalist id="mint-licences">
          {LICENCES.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40" onClick={save} disabled={typeof html !== "string"}>
          {t("mint.export")}
        </button>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700 disabled:opacity-40" onClick={open} disabled={typeof html !== "string"}>
          {t("mint.preview")}
        </button>
        <span className="text-zinc-500">{typeof html === "string" ? t("mint.size", { size: kb(bytes) }) : t("mint.cannot", { error: html.message })}</span>
      </div>
      <div className="max-w-2xl space-y-1.5 text-[11px] text-zinc-400">
        <p>
          {t("mint.about", { w: capture.width, h: capture.height })}
        </p>
        <p>
          {t("mint.reads")} <code className="text-zinc-300">?hash=</code> {t("mint.readsHex")} <code className="text-zinc-300">?width=</code>/
          <code className="text-zinc-300">?height=</code>{t("mint.sets")} <code className="text-zinc-300">window.$features</code> {t("mint.fires")}{" "}
          <code className="text-zinc-300">genart:done</code> {t("mint.complete")}
        </p>
        <p className="text-amber-200/80">
          {t("mint.warn")}
        </p>
      </div>
    </div>
  );
}
