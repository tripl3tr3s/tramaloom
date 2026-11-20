import type { ArtDocument, Layer } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import type { DragEvent } from "react";
import { useState } from "react";
import { needsGrid } from "../state/layerOrder.ts";
import { MAX_LAYERS } from "../state/limits.ts";
import type { Action } from "../state/store.ts";
import { CopyIcon, DownIcon, EyeIcon, EyeOffIcon, GripIcon, PlusIcon, TrashIcon, UpIcon } from "./icons.tsx";
import { Menu } from "./Menu.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly selectedId: string | null;
  readonly dispatch: (a: Action) => void;
}

const iconBtn =
  "grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 disabled:pointer-events-none disabled:opacity-30 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent";
const ADDABLE = Object.values(defaultRegistry).filter((m) => m.id !== "canvas");
const DRAG_TYPE = "application/x-gridloom-layer";

const labelOf = (module: string): string => getModule(defaultRegistry, module)?.label ?? module;

/** "Cell fill", or "Cell fill 2" when the doc has more than one layer of that module. */
function displayNames(layers: readonly Layer[]): ReadonlyMap<string, string> {
  return new Map(
    layers.map((l) => {
      const same = layers.filter((x) => x.module === l.module);
      const label = labelOf(l.module);
      return [l.id, same.length > 1 ? `${label} ${same.indexOf(l) + 1}` : label];
    }),
  );
}

export function LayerStack({ doc, selectedId, dispatch }: Props) {
  const names = displayNames(doc.layers);
  const [dragId, setDragId] = useState<string | null>(null);
  // Insertion point while dragging: the gap before layer `drop` (doc.layers.length = after the last).
  const [drop, setDrop] = useState<number | null>(null);
  const full = doc.layers.length >= MAX_LAYERS;

  const gapAt = (e: DragEvent<HTMLElement>, i: number): number => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(1, e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const onDrop = () => {
    const from = doc.layers.findIndex((l) => l.id === dragId);
    if (dragId && from >= 1 && drop !== null) {
      // The gap index counts the dragged layer; its final index does not.
      dispatch({ type: "moveLayerTo", layerId: dragId, index: drop > from ? drop - 1 : drop });
    }
    endDrag();
  };

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Layers</h2>
        <Menu
          label="Add layer"
          title={full ? `At most ${MAX_LAYERS} layers` : "Add a layer"}
          disabled={full}
          align="right"
          width="w-56"
          triggerClass="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
          trigger={
            <>
              <PlusIcon /> Add
            </>
          }
          items={ADDABLE.map((m) => ({
            label: m.label,
            description: m.description,
            onSelect: () => dispatch({ type: "addLayer", module: m.id }),
          }))}
        />
      </div>

      <ol className="flex flex-col gap-0.5" aria-label="Layers, top of the list is drawn first" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {doc.layers.map((l, i) => {
          const isCanvas = l.module === "canvas";
          const selected = l.id === selectedId;
          const name = names.get(l.id) ?? l.module;
          // No line for gaps next to the dragged layer: dropping there changes nothing.
          const from = doc.layers.findIndex((x) => x.id === dragId);
          const useful = dragId !== null && drop !== null && drop !== from && drop !== from + 1;
          const showBefore = useful && drop === i;
          const showAfter = useful && drop === doc.layers.length && i === doc.layers.length - 1;
          return (
            <li
              key={l.id}
              draggable={!isCanvas}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, l.id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(l.id);
              }}
              onDragEnd={endDrag}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDrop(gapAt(e, i));
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop();
              }}
              className={`group relative flex items-center gap-0.5 rounded py-1 pl-0.5 pr-1 text-xs ${selected ? "bg-sky-900/50 text-white" : "text-zinc-300 hover:bg-zinc-800"} ${dragId === l.id ? "opacity-40" : ""}`}
            >
              {showBefore && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-sky-400" />}
              {showAfter && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-sky-400" />}
              <span
                className={`grid size-5 place-items-center ${isCanvas ? "invisible" : "cursor-grab text-zinc-600 group-hover:text-zinc-400"}`}
                title="Drag to reorder"
              >
                <GripIcon />
              </span>
              {isCanvas ? (
                <span className="size-6" />
              ) : (
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={l.enabled ? `Hide ${name}` : `Show ${name}`}
                  title={l.enabled ? "Hide layer" : "Show layer"}
                  onClick={() => dispatch({ type: "toggleLayer", layerId: l.id })}
                >
                  {l.enabled ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              )}
              <button
                type="button"
                className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 ${l.enabled ? "" : "text-zinc-500 line-through decoration-zinc-600"}`}
                aria-current={selected ? "true" : undefined}
                title={`${name} (id ${l.id})`}
                onClick={() => dispatch({ type: "select", layerId: l.id })}
                onKeyDown={(e) => {
                  // Alt+arrows reorder from the keyboard, the counterpart of dragging.
                  if (isCanvas || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                  e.preventDefault();
                  dispatch({ type: "moveLayer", layerId: l.id, dir: e.key === "ArrowUp" ? -1 : 1 });
                }}
              >
                {name}
                {needsGrid(doc.layers, i) && (
                  <span className="ml-1.5 inline-grid size-3.5 place-items-center rounded-full bg-amber-500/20 align-[-1px] text-[9px] font-bold text-amber-300" title="Draws nothing: needs a Grid layer above it">
                    !<span className="sr-only">, draws nothing: needs a Grid layer above it</span>
                  </span>
                )}
              </button>
              {!isCanvas && (
                <span className={`flex items-center ${selected ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
                  {/* aria-disabled, not disabled: a button that disables itself under focus drops focus to <body>. */}
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={`Move ${name} up`}
                    title="Move up (Alt+Up)"
                    aria-disabled={i <= 1}
                    onClick={() => i > 1 && dispatch({ type: "moveLayer", layerId: l.id, dir: -1 })}
                  >
                    <UpIcon />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label={`Move ${name} down`}
                    title="Move down (Alt+Down)"
                    aria-disabled={i === doc.layers.length - 1}
                    onClick={() => i < doc.layers.length - 1 && dispatch({ type: "moveLayer", layerId: l.id, dir: 1 })}
                  >
                    <DownIcon />
                  </button>
                  <button type="button" className={iconBtn} aria-label={`Duplicate ${name}`} title="Duplicate" disabled={full} onClick={() => dispatch({ type: "duplicateLayer", layerId: l.id })}>
                    <CopyIcon />
                  </button>
                  <button
                    type="button"
                    className={`${iconBtn} hover:bg-red-950 hover:text-red-300`}
                    aria-label={`Remove ${name}`}
                    title="Remove (undo with Ctrl+Z)"
                    onClick={() => dispatch({ type: "removeLayer", layerId: l.id })}
                  >
                    <TrashIcon />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
