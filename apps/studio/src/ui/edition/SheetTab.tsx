import type { ArtDocument, Traits } from "@gridloom/core";
import { computeTraits, seedSeries } from "@gridloom/core";
import { useMemo, useState } from "react";
import { download, slug } from "../../render/export.ts";
import type { ThumbJob } from "../../render/protocol.ts";
import { useThumbnails } from "../../render/useThumbnails.ts";
import { randomHash } from "../../state/store.ts";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly onPick: (hash: string) => void;
  readonly notify: (msg: string) => void;
}

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
const THUMB = 240;
const traitLine = (t: Traits) => Object.values(t).map(String).join(" / ");

/** Compose the visible thumbnails into one PNG with hash and traits under each tile. */
async function exportSheet(doc: ArtDocument, urls: readonly string[], hashes: readonly string[], traits: readonly Traits[], cols: number) {
  const images = await Promise.all(urls.map(async (u) => createImageBitmap(await (await fetch(u)).blob())));
  const tw = Math.max(...images.map((b) => b.width));
  const th = Math.max(...images.map((b) => b.height));
  const pad = 16;
  const label = 40;
  const rows = Math.ceil(images.length / cols);
  const canvas = new OffscreenCanvas(cols * (tw + pad) + pad, rows * (th + label + pad) + pad);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  images.forEach((img, i) => {
    const x = pad + (i % cols) * (tw + pad);
    const y = pad + Math.floor(i / cols) * (th + label + pad);
    ctx.drawImage(img, x + (tw - img.width) / 2, y + (th - img.height) / 2);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText((hashes[i] ?? "").slice(0, 16), x, y + th + 6, tw);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(traitLine(traits[i] ?? {}), x, y + th + 22, tw);
    img.close();
  });
  download(await canvas.convertToBlob({ type: "image/png" }), `${slug(doc.name)}_sheet_${(hashes[0] ?? "").slice(0, 10)}.png`);
}

export function SheetTab({ doc, hash, onPick, notify }: Props) {
  const [n, setN] = useState(4);
  const [root, setRoot] = useState(hash);
  const hashes = useMemo(() => seedSeries(root, n * n), [root, n]);
  const jobs = useMemo((): readonly ThumbJob[] => hashes.map((h) => ({ doc, hash: h })), [doc, hashes]);
  const traits = useMemo(() => hashes.map((h) => (doc.traits?.length ? computeTraits(doc, h) : {})), [doc, hashes]);
  const { urls, fresh, busy, error } = useThumbnails(jobs, THUMB, hashes);
  const [exporting, setExporting] = useState(false);

  const save = async () => {
    const ready = urls.filter((u): u is string => u !== null);
    if (!fresh || ready.length !== urls.length) return notify("Wait for the sheet to finish rendering");
    setExporting(true);
    try {
      await exportSheet(doc, ready, hashes, traits, n);
    } catch (e) {
      notify(`Sheet export failed: ${String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <label className="flex items-center gap-1">
          Grid
          <select className={field} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Sheet size">
            {[3, 4, 5, 6, 8].map((k) => (
              <option key={k} value={k}>
                {k} x {k}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => setRoot(randomHash())}>
          New sample
        </button>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => setRoot(hash)}>
          From current seed
        </button>
        <button
          type="button"
          className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40"
          onClick={save}
          disabled={!fresh || exporting}
        >
          Export PNG
        </button>
        <span className="text-zinc-500" aria-live="polite">
          {error ?? (busy ? "rendering" : "")}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500">One good render proves nothing: look at many. Click a tile to open that seed.</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {hashes.map((h, i) => (
          <button
            type="button"
            key={h}
            onClick={() => onPick(h)}
            className="group flex flex-col gap-1 rounded-lg p-1 text-left hover:bg-zinc-900"
            title={`Open ${h}`}
          >
            <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded bg-zinc-900">
              {urls[i] ? (
                <img src={urls[i] ?? undefined} alt={traitLine(traits[i] ?? {}) || h} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-600">...</span>
              )}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">{h.slice(0, 10)}</span>
            {doc.traits?.length ? <span className="truncate text-[10px] text-zinc-300">{traitLine(traits[i] ?? {})}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
