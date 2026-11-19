import type { ArtDocument } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { MAX_LAYERS } from "../state/limits.ts";
import type { Action } from "../state/store.ts";

interface Props {
  readonly doc: ArtDocument;
  readonly selectedId: string | null;
  readonly dispatch: (a: Action) => void;
}

const iconBtn = "rounded px-1 text-[11px] text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-30";
const ADDABLE = Object.values(defaultRegistry).filter((m) => m.id !== "canvas");

export function LayerStack({ doc, selectedId, dispatch }: Props) {
  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Layers</h2>
        <select
          className="rounded bg-zinc-800 px-1 py-0.5 text-[11px] text-zinc-300"
          value=""
          disabled={doc.layers.length >= MAX_LAYERS}
          onChange={(e) => e.target.value && dispatch({ type: "addLayer", module: e.target.value })}
          aria-label="Add layer"
        >
          <option value="">+ add</option>
          {ADDABLE.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {doc.layers.map((l, i) => {
        const isCanvas = l.module === "canvas";
        const selected = l.id === selectedId;
        return (
          <div
            key={l.id}
            className={`group flex items-center gap-1 rounded px-2 py-1.5 text-xs ${selected ? "bg-sky-900/50 text-white" : "text-zinc-300 hover:bg-zinc-800"} ${l.enabled ? "" : "opacity-50"}`}
          >
            <button type="button" className="flex-1 truncate text-left" onClick={() => dispatch({ type: "select", layerId: l.id })}>
              {getModule(defaultRegistry, l.module)?.label ?? l.module}
              <span className="ml-1.5 font-mono text-[10px] text-zinc-500">{l.id}</span>
            </button>
            {!isCanvas && (
              <>
                <button type="button" className={iconBtn} title="Toggle" onClick={() => dispatch({ type: "toggleLayer", layerId: l.id })}>
                  {l.enabled ? "on" : "off"}
                </button>
                <button type="button" className={iconBtn} title="Move up" disabled={i <= 1} onClick={() => dispatch({ type: "moveLayer", layerId: l.id, dir: -1 })}>
                  ↑
                </button>
                <button type="button" className={iconBtn} title="Move down" disabled={i === doc.layers.length - 1} onClick={() => dispatch({ type: "moveLayer", layerId: l.id, dir: 1 })}>
                  ↓
                </button>
                <button type="button" className={iconBtn} title="Duplicate" onClick={() => dispatch({ type: "duplicateLayer", layerId: l.id })}>
                  dup
                </button>
                <button type="button" className={iconBtn} title="Remove" onClick={() => dispatch({ type: "removeLayer", layerId: l.id })}>
                  x
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
