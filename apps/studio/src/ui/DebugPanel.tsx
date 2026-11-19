import type { RenderInfo } from "../render/useRenderer.ts";

const fmt = (v: unknown): string => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(3) : String(v));

export function DebugPanel({ hash, info }: { readonly hash: string; readonly info: RenderInfo }) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 max-h-[60%] w-72 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-[10px] text-zinc-300 shadow-xl">
      <div className="mb-2 break-all text-zinc-400">{hash}</div>
      <div className="mb-2 flex gap-3 text-zinc-400">
        <span>{info.ms.toFixed(1)} ms</span>
        <span>{info.cells} cells</span>
        <span>{info.items} items</span>
      </div>
      {info.error && <div className="mb-2 text-red-400">{info.error}</div>}
      {info.resolved.map((l) => (
        <div key={l.id} className="mb-1.5">
          <div className="text-sky-400">{l.id}</div>
          {Object.entries(l.values).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 pl-2">
              <span className="text-zinc-500">{k}</span>
              <span>{fmt(v)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
