import type { ArtDocument, CensusFlag, CensusResult } from "@gridloom/core";
import { censusFlags } from "@gridloom/core";
import { useEffect, useRef, useState } from "react";
import type { ToolRun } from "../../render/runTool.ts";
import { runTool } from "../../render/runTool.ts";
import { randomHash } from "../../state/store.ts";
import { pct, ShareBar } from "./ShareBar.tsx";

const FLAG_TEXT: Record<CensusFlag, string> = {
  never: "never appeared",
  dominant: "80%+ of pieces",
  "too-rare": "expected under once in the edition",
};

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";

export function CensusTab({ doc }: { readonly doc: ArtDocument }) {
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
        if (run.current === r && !(e instanceof Error && e.message === "cancelled")) setError(String(e));
      },
    ).finally(() => run.current === r && setRunning(false));
  };

  const traits = doc.traits ?? [];
  if (traits.length === 0) return <p className="text-xs text-zinc-500">Add traits first; the census measures them over many seeds.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <label className="flex items-center gap-1">
          Seeds
          <select className={field} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Seeds to sample">
            {[1000, 5000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1" title="Used to flag values expected less than once in the real edition">
          Edition size
          <input
            type="number"
            min={1}
            max={100000}
            className={`${field} w-20`}
            value={edition}
            onChange={(e) => setEdition(Math.min(100000, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            aria-label="Edition size"
          />
        </label>
        <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600" onClick={start}>
          {running ? "Restart" : "Run census"}
        </button>
        {running && (
          <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => run.current?.cancel()}>
            Cancel
          </button>
        )}
        <span className="text-zinc-500" aria-live="polite">
          {running ? "counting" : error ?? (result ? `${result.data.total.toLocaleString()} seeds in ${(result.ms / 1000).toFixed(1)}s` : "")}
        </span>
      </div>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-sky-500" /> measured
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-0.5 rounded bg-zinc-100" /> target from settings
            </span>
            <span>
              Duplicate trait sets: {result.data.duplicateTuples.toLocaleString()} of {result.data.total.toLocaleString()}
              {result.data.duplicateTuples > 0 && edition > 0 ? " (fine if traits are coarse on purpose)" : ""}
            </span>
            <span className="font-mono text-zinc-600" title="Root seed of this sample">
              {result.root.slice(0, 12)}
            </span>
          </div>
          {result.data.traits.map((t) => {
            const flags = censusFlags(t, result.data.total, edition);
            const labels = [...new Set([...Object.keys(t.expected?.shares ?? {}), ...Object.keys(t.counts)])];
            return (
              <section key={t.name}>
                <h3 className="mb-1 text-xs font-semibold text-zinc-200">
                  {t.name}
                  {t.expected && !t.expected.exact && <span className="ml-2 font-normal text-zinc-500">targets approximate</span>}
                </h3>
                <div className="space-y-1">
                  {labels.map((k) => {
                    const measured = (t.counts[k] ?? 0) / Math.max(1, result.data.total);
                    const target = t.expected?.shares[k];
                    const f = flags[k] ?? [];
                    const tip = `${k}: ${(t.counts[k] ?? 0).toLocaleString()} pieces, ${pct(measured)}${target !== undefined ? `, target ${pct(target)}` : ""}`;
                    return (
                      <div key={k} className="flex items-center gap-2 text-[11px]" title={tip}>
                        <span className="w-24 truncate text-zinc-300">{k}</span>
                        <ShareBar share={measured} {...(target !== undefined ? { target } : {})} />
                        <span className="w-32 text-right tabular-nums text-zinc-400">
                          {pct(measured)}
                          {target !== undefined && <span className="text-zinc-600"> / {pct(target)}</span>}
                        </span>
                        <span className="w-48 text-amber-300">{f.map((x) => FLAG_TEXT[x]).join(", ")}</span>
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
