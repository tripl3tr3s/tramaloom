import type { ArtDocument } from "@tramaloom/core";
import { hasScripts } from "@tramaloom/core";
import { useEffect, useRef, useState } from "react";
import { download, slug } from "../../render/export.ts";
import type { ToolRun } from "../../render/runTool.ts";
import { runScriptBatch, runTool } from "../../render/runTool.ts";
import { drawable } from "../../sandbox/trust.ts";
import { randomHash } from "../../state/store.ts";
import { useLang } from "../../i18n/i18n.tsx";
import { errorText } from "../../i18n/errors.ts";

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
/** Pieces per batch by long side: every PNG is held until the zip is written. */
export const BATCH_LIMITS: Readonly<Record<number, number>> = { 1000: 200, 2000: 120, 4000: 40 };

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly notify: (m: string) => void;
  readonly onBusy: (busy: boolean) => void;
}

export function BatchTab({ doc, hash, notify, onBusy }: Props) {
  const { t } = useLang();
  const [count, setCount] = useState(16);
  const [size, setSize] = useState(2000);
  const [from, setFrom] = useState<"current" | "random">("current");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const max = BATCH_LIMITS[size] ?? 40;
  useEffect(() => onBusy(progress !== null), [progress, onBusy]);
  const run = useRef<ToolRun<Blob> | null>(null);
  useEffect(() => () => run.current?.cancel(), []);

  const start = () => {
    run.current?.cancel();
    const root = from === "current" ? hash : randomHash();
    const base = slug(doc.name);
    const n = Math.min(count, max);
    // Script layers not approved yet are left out, as on the canvas; approved ones are drawn in the sandbox.
    const piece = drawable(doc);
    const onProgress = (done: number, total: number) => setProgress({ done, total });
    const r = hasScripts(piece)
      ? runScriptBatch({ doc: piece, record: doc, root, count: n, size, base }, onProgress)
      : runTool({ kind: "batch", doc: piece, record: doc, root, count: n, size, base }, onProgress);
    run.current = r;
    setProgress({ done: 0, total: n });
    r.promise.then(
      (zipBlob) => {
        download(zipBlob, `${base}_${n}x${size}_${root.slice(0, 10)}.zip`);
        notify(t("batch.exported", { n }));
      },
      (e: unknown) => {
        if (!(e instanceof Error && e.message === "cancelled")) notify(t("batch.failed", { error: errorText(e, t) }));
      },
    ).finally(() => {
      if (run.current === r) {
        run.current = null;
        setProgress(null);
      }
    });
  };

  const running = progress !== null;
  return (
    <div className="space-y-3 text-xs text-zinc-300">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          {t("batch.pieces")}
          <input
            type="number"
            min={1}
            max={max}
            className={`${field} w-16`}
            value={Math.min(count, max)}
            onChange={(e) => setCount(Math.min(max, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            aria-label={t("batch.piecesLabel")}
            disabled={running}
          />
        </label>
        <label className="flex items-center gap-1">
          {t("batch.longSide")}
          <select className={field} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label={t("batch.longSideLabel")} disabled={running}>
            {[1000, 2000, 4000].map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          {t("batch.seeds")}
          <select
            className={field}
            value={from}
            onChange={(e) => setFrom(e.target.value === "random" ? "random" : "current")}
            aria-label={t("batch.seedSource")}
            disabled={running}
          >
            <option value="current">{t("batch.fromCurrent")}</option>
            <option value="random">{t("batch.fromRandom")}</option>
          </select>
        </label>
        {running ? (
          <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => run.current?.cancel()}>
            {t("common.cancel")}
          </button>
        ) : (
          <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600" onClick={start}>
            {t("batch.export")}
          </button>
        )}
      </div>
      {progress && (
        <div className="flex items-center gap-2" aria-live="polite">
          <progress className="h-2 w-64" value={progress.done} max={progress.total} aria-label={t("batch.progress")} />
          <span className="tabular-nums text-zinc-400">
            {progress.done} / {progress.total}
          </span>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        {t("batch.about", { max, size })}
      </p>
      {hasScripts(drawable(doc)) && (
        <p className="text-[11px] text-zinc-500">{t("batch.scripts")}</p>
      )}
    </div>
  );
}
