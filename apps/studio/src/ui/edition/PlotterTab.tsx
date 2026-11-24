import type { ArtDocument, Drawing, Paper, PlotterOptions } from "@tramaloom/core";
import { DEFAULT_PLOTTER, generate, hasScripts, PAPERS, toPlotterSVG } from "@tramaloom/core";
import { drawInSandbox } from "../../sandbox/host.ts";
import { drawable, useTrustVersion } from "../../sandbox/trust.ts";
import { useEffect, useMemo, useState } from "react";
import { download, slug } from "../../render/export.ts";
import { entryFromBytes, zip } from "../../render/zip.ts";
import { useLang } from "../../i18n/i18n.tsx";

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
/** Pen-down speed for the time estimate; typical for an AxiDraw-class plotter at default settings. */
const MM_PER_SECOND = 25;
/** Pen down, pen up: what a dot costs, and what dominates the time of a stipple. */
const SECONDS_PER_LIFT = 0.25;
const PAPER_LABEL: Record<Paper, string> = { a5: "A5", a4: "A4", a3: "A3", letter: "plot.letter" };

const metres = (mm: number) => (mm >= 1000 ? `${(mm / 1000).toFixed(1)} m` : `${Math.round(mm)} mm`);
/** Estimated plotting time in minutes: drawing at MM_PER_SECOND plus a moment per pen lift. */
const minutes = (mm: number, lifts: number): number => (mm / MM_PER_SECOND + lifts * SECONDS_PER_LIFT) / 60;

/** Pen-plotter export: outlines only, one layer (or file) per color, on a real paper size. */
export function PlotterTab({ doc: piece, hash, notify }: { readonly doc: ArtDocument; readonly hash: string; readonly notify: (m: string) => void }) {
  // Script layers whose code is not approved yet are left out, as on the canvas.
  const trust = useTrustVersion();
  // eslint-free note: trust is read so an approval redraws.
  // `trust` changes when code is approved, so the plot redraws with it.
  const doc = useMemo(() => drawable(piece), [piece, trust]);
  const { t } = useLang();
  const paperLabel = (p: Paper): string => (p === "letter" ? t("plot.letter") : PAPER_LABEL[p]);
  const [opts, setOpts] = useState<PlotterOptions>(DEFAULT_PLOTTER);
  const set = <K extends keyof PlotterOptions>(k: K, v: PlotterOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  // The scene only depends on the piece; paper and pen edits re-run the cheap conversion alone.
  // Script layers are drawn in the sandbox, so that drawing arrives a moment later.
  const local = useMemo(() => {
    if (hasScripts(doc)) return null;
    try {
      return generate(doc, hash).scene as Drawing;
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, [doc, hash]);
  const [remote, setRemote] = useState<{ readonly doc: ArtDocument; readonly hash: string; readonly value: Drawing | Error } | null>(null);
  useEffect(() => {
    if (!hasScripts(doc)) return;
    let live = true;
    drawInSandbox(doc, hash).then(
      (value) => live && setRemote({ doc, hash, value }),
      (e: unknown) => live && setRemote({ doc, hash, value: e instanceof Error ? e : new Error(String(e)) }),
    );
    return () => {
      live = false;
    };
  }, [doc, hash]);
  const scene = local ?? (remote?.doc === doc && remote.hash === hash ? remote.value : null);
  const loading = scene === null;
  const out = useMemo(() => (scene === null ? new Error("still drawing") : scene instanceof Error ? scene : toPlotterSVG(scene, opts)), [scene, opts]);

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
    notify(t("plot.exported", { file: `${base}-plot.svg` }));
  };
  const savePens = () => {
    if (out instanceof Error) return;
    const enc = new TextEncoder();
    const entries = out.penSvgs.map((svg, i) => entryFromBytes(`${base}-pen${i + 1}-${(out.layers[i]?.color ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}.svg`, enc.encode(svg)));
    download(zip(entries), `${base}-pens.zip`);
    notify(t("plot.exportedPens", { n: entries.length }));
  };

  return (
    <div className="grid gap-4 text-xs text-zinc-300 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="grid place-items-center rounded-lg bg-zinc-900 p-4">
        {loading ? (
          <p className="text-zinc-400">{t("plot.drawingScripts")}</p>
        ) : out instanceof Error ? (
          <p className="text-red-400">{t("plot.failed", { error: out.message })}</p>
        ) : preview ? (
          <img src={preview} alt={t("plot.previewAlt", { paper: paperLabel(opts.paper) })} className="max-h-[60vh] w-auto bg-white shadow-lg" />
        ) : null}
      </div>
      <div className="space-y-3">
        <p className="leading-relaxed text-zinc-400">
          {t("plot.intro")}
        </p>
        <label className="flex items-center justify-between gap-2">
          {t("plot.paper")}
          <select className={field} value={opts.paper} onChange={(e) => set("paper", e.target.value as Paper)}>
            {(Object.keys(PAPERS) as Paper[]).map((p) => (
              <option key={p} value={p}>
                {paperLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          {t("plot.orientation")}
          <select className={field} value={opts.orientation} onChange={(e) => set("orientation", e.target.value as PlotterOptions["orientation"])}>
            <option value="auto">{t("plot.matchArt")}</option>
            <option value="portrait">{t("plot.portrait")}</option>
            <option value="landscape">{t("plot.landscape")}</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          {t("plot.margin")}
          <input type="number" className={`${field} w-20`} min={0} max={80} step={1} value={opts.marginMm} onChange={(e) => e.target.value !== "" && set("marginMm", Number(e.target.value))} />
        </label>
        <label className="flex items-center justify-between gap-2" title={t("plot.penWidthHint")}>
          {t("plot.penWidth")}
          <input type="number" className={`${field} w-20`} min={0.05} max={3} step={0.05} value={opts.penMm} onChange={(e) => e.target.value !== "" && set("penMm", Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-sky-500" checked={opts.includeTexture} onChange={(e) => set("includeTexture", e.target.checked)} />
          {t("plot.grain")}
        </label>

        {!(out instanceof Error) && (
          <>
            <table className="w-full text-[11px]">
              <caption className="sr-only">{t("plot.pens")}</caption>
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left font-normal">{t("plot.pen")}</th>
                  <th className="text-right font-normal">{t("plot.paths")}</th>
                  <th className="text-right font-normal">{t("plot.distance")}</th>
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
                    <td className="text-right font-mono" title={l.lifts > l.paths ? t("plot.taps", { n: l.lifts }) : undefined}>
                      {l.lifts > l.paths ? t("plot.dots", { n: l.lifts }) : metres(l.lengthMm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-zinc-500">
              {[
                out.layers.length === 1 ? t("plot.onePen") : t("plot.manyPens", { n: out.layers.length }),
                total >= 1 ? t("plot.ofDrawing", { d: metres(total) }) : "",
                lifts > 1000 ? t("plot.manyLifts", { n: lifts }) : "",
                t("plot.at", {
                  time: minutes(total, lifts) < 1 ? t("plot.underMinute") : t("plot.aboutMin", { n: Math.round(minutes(total, lifts)) }),
                  speed: MM_PER_SECOND,
                }),
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-600 disabled:opacity-40" disabled={!out.layers.length} onClick={saveOne}>
                {t("plot.download")}
              </button>
              <button type="button" className="rounded bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700 disabled:opacity-40" disabled={out.layers.length < 2} onClick={savePens} title={t("plot.perPenHint")}>
                {t("plot.perPen")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
