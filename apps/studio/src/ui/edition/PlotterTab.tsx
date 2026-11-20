import type { ArtDocument, Paper, PlotterOptions } from "@gridloom/core";
import { DEFAULT_PLOTTER, generate, PAPERS, toPlotterSVG } from "@gridloom/core";
import { useEffect, useMemo, useState } from "react";
import { download, slug } from "../../render/export.ts";
import { entryFromBytes, zip } from "../../render/zip.ts";

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
/** Pen-down speed for the time estimate; typical for an AxiDraw-class plotter at default settings. */
const MM_PER_SECOND = 25;
/** Pen down, pen up: what a dot costs, and what dominates the time of a stipple. */
const SECONDS_PER_LIFT = 0.25;
const PAPER_LABEL: Record<Paper, string> = { a5: "A5", a4: "A4", a3: "A3", letter: "US Letter" };

const metres = (mm: number) => (mm >= 1000 ? `${(mm / 1000).toFixed(1)} m` : `${Math.round(mm)} mm`);
const minutes = (mm: number, lifts: number) => {
  const m = (mm / MM_PER_SECOND + lifts * SECONDS_PER_LIFT) / 60;
  return m < 1 ? "under a minute" : `about ${Math.round(m)} min`;
};

/** Pen-plotter export: outlines only, one layer (or file) per color, on a real paper size. */
export function PlotterTab({ doc, hash, notify }: { readonly doc: ArtDocument; readonly hash: string; readonly notify: (m: string) => void }) {
  const [opts, setOpts] = useState<PlotterOptions>(DEFAULT_PLOTTER);
  const set = <K extends keyof PlotterOptions>(k: K, v: PlotterOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  // The scene only depends on the piece; paper and pen edits re-run the cheap conversion alone.
  const scene = useMemo(() => {
    try {
      return generate(doc, hash).scene;
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [doc, hash]);
  const out = useMemo(() => (scene instanceof Error ? scene : toPlotterSVG(scene, opts)), [scene, opts]);

  // Preview: the plot itself on white paper, as an image (never injected as markup).
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (out instanceof Error) return setPreview(null);
    const url = URL.createObjectURL(new Blob([out.svg], { type: "image/svg+xml" }));
    setPreview(url);
    // Revoke a little later: the <img> may still be loading this URL when the next one arrives.
    return () => {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }, [out]);

  const base = `${slug(doc.name)}-${hash.slice(0, 8)}-${opts.paper}`;
  const total = out instanceof Error ? 0 : out.layers.reduce((s, l) => s + l.lengthMm, 0);
  const lifts = out instanceof Error ? 0 : out.layers.reduce((s, l) => s + l.lifts, 0);

  const saveOne = () => {
    if (out instanceof Error) return;
    download(new Blob([out.svg], { type: "image/svg+xml" }), `${base}-plot.svg`);
    notify(`Exported ${base}-plot.svg`);
  };
  const savePens = () => {
    if (out instanceof Error) return;
    const enc = new TextEncoder();
    const entries = out.penSvgs.map((svg, i) => entryFromBytes(`${base}-pen${i + 1}-${(out.layers[i]?.color ?? "").replace("#", "")}.svg`, enc.encode(svg)));
    download(zip(entries), `${base}-pens.zip`);
    notify(`Exported ${entries.length} pen files`);
  };

  return (
    <div className="grid gap-4 text-xs text-zinc-300 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="grid place-items-center rounded-lg bg-zinc-900 p-4">
        {out instanceof Error ? (
          <p className="text-red-400">Could not build the plot: {out.message}</p>
        ) : preview ? (
          <img src={preview} alt={`Plot preview on ${PAPER_LABEL[opts.paper]}`} className="max-h-[60vh] w-auto bg-white shadow-lg" />
        ) : null}
      </div>
      <div className="space-y-3">
        <p className="leading-relaxed text-zinc-400">
          Every shape becomes its outline, one layer per color. Fills are not hatched: add a Hatching layer for shading. Shapes in the background color are left out, and so is grain unless you ask for it.
        </p>
        <label className="flex items-center justify-between gap-2">
          Paper
          <select className={field} value={opts.paper} onChange={(e) => set("paper", e.target.value as Paper)}>
            {(Object.keys(PAPERS) as Paper[]).map((p) => (
              <option key={p} value={p}>
                {PAPER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          Orientation
          <select className={field} value={opts.orientation} onChange={(e) => set("orientation", e.target.value as PlotterOptions["orientation"])}>
            <option value="auto">Match the art</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          Margin (mm)
          <input type="number" className={`${field} w-20`} min={0} max={80} step={1} value={opts.marginMm} onChange={(e) => e.target.value !== "" && set("marginMm", Number(e.target.value))} />
        </label>
        <label className="flex items-center justify-between gap-2" title="Preview stroke only; the plotter draws with the pen you load">
          Pen width (mm)
          <input type="number" className={`${field} w-20`} min={0.05} max={3} step={0.05} value={opts.penMm} onChange={(e) => e.target.value !== "" && set("penMm", Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-sky-500" checked={opts.includeTexture} onChange={(e) => set("includeTexture", e.target.checked)} />
          Include grain texture (slow to plot)
        </label>

        {!(out instanceof Error) && (
          <>
            <table className="w-full text-[11px]">
              <caption className="sr-only">Pens</caption>
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left font-normal">Pen</th>
                  <th className="text-right font-normal">Paths</th>
                  <th className="text-right font-normal">Distance</th>
                </tr>
              </thead>
              <tbody>
                {out.layers.map((l, i) => (
                  <tr key={l.color}>
                    <td className="flex items-center gap-1.5 py-0.5">
                      <span className="size-3 rounded-sm ring-1 ring-zinc-700" style={{ background: l.color }} aria-hidden="true" />
                      {i + 1} <span className="font-mono text-zinc-500">{l.color}</span>
                    </td>
                    <td className="text-right font-mono">{l.paths}</td>
                    <td className="text-right font-mono" title={l.lifts > l.paths ? `${l.lifts} pen taps` : undefined}>
                      {l.lifts > l.paths ? `${l.lifts} dots` : metres(l.lengthMm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-zinc-500">
              {out.layers.length} {out.layers.length === 1 ? "pen" : "pens"}, {total >= 1 ? `${metres(total)} of drawing, ` : ""}
              {lifts > 1000 ? `${lifts} pen lifts, ` : ""}
              {minutes(total, lifts)} at {MM_PER_SECOND} mm/s.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-600 disabled:opacity-40" disabled={!out.layers.length} onClick={saveOne}>
                Download SVG
              </button>
              <button type="button" className="rounded bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700 disabled:opacity-40" disabled={out.layers.length < 2} onClick={savePens} title="A separate file per pen, for plotters that take one pen at a time">
                One file per pen (.zip)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
