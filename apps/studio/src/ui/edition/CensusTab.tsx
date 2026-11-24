import type { ArtDocument, CensusFlag, CensusResult } from "@tramaloom/core";
import { censusFlags } from "@tramaloom/core";
import { useEffect, useRef, useState } from "react";
import type { ToolRun } from "../../render/runTool.ts";
import { runTool } from "../../render/runTool.ts";
import { randomHash } from "../../state/store.ts";
import { pct, ShareBar } from "./ShareBar.tsx";
import { useLang } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { errorText } from "../../i18n/errors.ts";

const FLAG_TEXT: Record<CensusFlag, MessageKey> = {
  never: "census.never",
  dominant: "census.dominant",
  "too-rare": "census.tooRare",
};

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";

export function CensusTab({ doc }: { readonly doc: ArtDocument }) {
  const { t } = useLang();
  const [count, setCount] = useState(5000);
  const [edition, setEdition] = useState(500);
  const [result, setResult] = useState<{ root: string; data: CensusResult; ms: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<ToolRun<CensusResult> | null>(null);
  useEffect(() => () => run.current?.cancel(), []);

  const start = () => {
    run.current?.cancel();
    const root = randomHash();
    const t0 = performance.now();
    const r = runTool({ kind: "census", doc, root, count });
    run.current = r;
    setRunning(true);
    setError(null);
    r.promise.then(
      (data) => {
        if (run.current === r) setResult({ root, data, ms: performance.now() - t0 });
      },
      (e: unknown) => {
        if (run.current === r && !(e instanceof Error && e.message === "cancelled")) setError(errorText(e, t));
      },
    ).finally(() => run.current === r && setRunning(false));
  };

  const traits = doc.traits ?? [];
  if (traits.length === 0) return <p className="text-xs text-zinc-500">{t("census.noTraits")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <label className="flex items-center gap-1">
          {t("batch.seeds")}
          <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label={t("census.sample")}>
            {[1000, 5000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1" title={t("census.editionHint")}>
          {t("census.edition")}
          <input
            type="number"
            min={1}
            max={100000}
            className={`${field} w-20`}
            value={edition}
            onChange={(e) => setEdition(Math.min(100000, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            aria-label={t("census.edition")}
          />
        </label>
        <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600" onClick={start}>
          {running ? t("census.restart") : t("census.run")}
        </button>
        {running && (
          <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => run.current?.cancel()}>
            {t("common.cancel")}
          </button>
        )}
        <span className="text-zinc-500" aria-live="polite">
          {running ? t("census.counting") : error ?? (result ? t("census.done", { n: result.data.total.toLocaleString(), s: (result.ms / 1000).toFixed(1) }) : "")}
        </span>
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-sky-500" /> {t("census.measured")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-0.5 rounded bg-zinc-100" /> {t("census.target")}
            </span>
            <span>
              {t("census.duplicates", { n: result.data.duplicateTuples.toLocaleString(), total: result.data.total.toLocaleString() })}
              {result.data.duplicateTuples > 0 && edition > 0 ? t("census.duplicatesFine") : ""}
            </span>
            <span className="font-mono text-zinc-600" title={t("census.root")}>
              {result.root.slice(0, 12)}
            </span>
          </div>
          {result.data.traits.map((trait) => {
            const flags = censusFlags(trait, result.data.total, edition);
            const labels = [...new Set([...Object.keys(trait.expected?.shares ?? {}), ...Object.keys(trait.counts)])];
            return (
              <section key={trait.name}>
                <h3 className="mb-1 text-xs font-semibold text-zinc-200">
                  {trait.name}
                  {trait.expected && !trait.expected.exact && <span className="ml-2 font-normal text-zinc-500">{t("census.approx")}</span>}
                </h3>
                <div className="space-y-1">
                  {labels.map((k) => {
                    const measured = (trait.counts[k] ?? 0) / Math.max(1, result.data.total);
                    const target = trait.expected?.shares[k];
                    const f = flags[k] ?? [];
                    const tipVars = { value: k, n: (trait.counts[k] ?? 0).toLocaleString(), pct: pct(measured) };
                    const tip = target !== undefined ? t("census.tipTarget", { ...tipVars, target: pct(target) }) : t("census.tip", tipVars);
                    return (
                      <div key={k} className="flex items-center gap-2 text-[11px]" title={tip}>
                        <span className="w-24 truncate text-zinc-300">{k}</span>
                        <ShareBar share={measured} {...(target !== undefined ? { target } : {})} />
                        <span className="w-32 text-right tabular-nums text-zinc-400">
                          {pct(measured)}
                          {target !== undefined && <span className="text-zinc-600"> / {pct(target)}</span>}
                        </span>
                        <span className="w-48 text-amber-300">{f.map((x) => t(FLAG_TEXT[x])).join(", ")}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
