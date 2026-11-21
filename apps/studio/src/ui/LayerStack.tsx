import type { ArtDocument, Layer } from "@gridloom/core";
import { defaultRegistry, layerDef } from "@gridloom/core";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";
import type { Zones } from "../state/layerOrder.ts";
import { needsGrid, zones } from "../state/layerOrder.ts";
import { MAX_LAYERS } from "../state/limits.ts";
import type { Action } from "../state/store.ts";
import { CopyIcon, DownIcon, EyeIcon, EyeOffIcon, GripIcon, PinIcon, PlusIcon, TrashIcon, UpIcon } from "./icons.tsx";
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

const labelOf = (layer: Layer): string => layerDef(defaultRegistry, layer)?.label ?? layer.module;

/** Free copies of the setup modules do a different job mid-stack, so they get their own names. */
const FREE_ROLE: Readonly<Record<string, { readonly label: string; readonly description: string }>> = {
  grid: { label: "Re-grid", description: "A second grid: the layers below it draw on these cells instead." },
  palette: { label: "Re-palette", description: "Switch colors for the layers below it." },
  symmetry: { label: "Mirror", description: "Mirror only the layers above it." },
};

const roleLabel = (l: Layer, i: number, z: Zones): string => {
  const free = i >= z.head && i < z.tail ? FREE_ROLE[l.module] : undefined;
  return free?.label ?? labelOf(l);
};

/** "Cell fill", or "Cell fill 2" when more than one layer shares that name. */
function displayNames(layers: readonly Layer[], z: Zones): ReadonlyMap<string, string> {
  const labels = layers.map((l, i) => roleLabel(l, i, z));
  return new Map(
    layers.map((l, i) => {
      const label = labels[i] ?? l.module;
      const same = labels.filter((x) => x === label).length;
      const nth = labels.slice(0, i + 1).filter((x) => x === label).length;
      return [l.id, same > 1 ? `${label} ${nth}` : label];
    }),
  );
}

/** Add menu entries: setup modules fill their pinned slot when empty, else they add their free role. */
function addItems(
  layers: readonly Layer[],
  z: Zones,
): readonly { readonly id: string; readonly label: string; readonly description: string; readonly disabled?: boolean }[] {
  const inHead = (m: string) => layers.slice(0, z.head).some((l) => l.module === m);
  const inTail = (m: string) => layers.slice(z.tail).some((l) => l.module === m);
  return ADDABLE.flatMap((m) => {
    // Kept in the list, greyed, so it never looks missing; one Post finishes the picture.
    if (m.id === "post" && inTail("post")) return [{ id: m.id, label: m.label, description: "Already at the end of the stack.", disabled: true }];
    const taken = m.id === "symmetry" ? inTail("symmetry") : (m.id === "grid" || m.id === "palette") && inHead(m.id);
    const free = taken ? FREE_ROLE[m.id] : undefined;
    return [{ id: m.id, label: free?.label ?? m.label, description: free?.description ?? m.description }];
  });
}

export function LayerStack({ doc, selectedId, dispatch }: Props) {
  const z = zones(doc.layers);
  const names = displayNames(doc.layers, z);
  const free = (i: number) => i >= z.head && i < z.tail;
  const [dragId, setDragId] = useState<string | null>(null);
  // Insertion point while dragging: the gap before layer `drop` (doc.layers.length = after the last).
  const [drop, setDrop] = useState<number | null>(null);
  const full = doc.layers.length >= MAX_LAYERS;

  const gapAt = (row: Element, clientY: number, i: number): number => {
    const r = row.getBoundingClientRect();
    // Drops land only between free layers.
    return Math.min(z.tail, Math.max(z.head, clientY < r.top + r.height / 2 ? i : i + 1));
  };
  // Touch and pen: HTML drag and drop does not fire for fingers, so the grip drives the same
  // dragId/drop state with pointer events. The mouse keeps native drag and drop.
  const touchMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragId) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-layer-index]");
    const i = Number(row?.dataset["layerIndex"]);
    if (row && Number.isInteger(i)) setDrop(gapAt(row, e.clientY, i));
  };
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const onDrop = () => {
    const from = doc.layers.findIndex((l) => l.id === dragId);
    if (dragId && free(from) && drop !== null) {
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
          // Inside the scrolling layer panel, so it must fit the panel's width (w-60).
          width="w-[13.25rem]"
          triggerClass="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
          trigger={
            <>
              <PlusIcon /> Add
            </>
          }
          items={addItems(doc.layers, z).map((m) => ({
            label: m.label,
            description: m.description,
            ...(m.disabled ? { disabled: true } : {}),
            onSelect: () => dispatch({ type: "addLayer", module: m.id }),
          }))}
        />
      </div>

      <ol className="flex flex-col gap-0.5" aria-label="Layers, top of the list is drawn first" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}>
        {doc.layers.map((l, i) => {
          const isCanvas = l.module === "canvas";
          const movable = free(i);
          const pinnedHead = i < z.head;
          const selected = l.id === selectedId;
          const name = names.get(l.id) ?? l.module;
          // No line for gaps next to the dragged layer: dropping there changes nothing.
          const from = doc.layers.findIndex((x) => x.id === dragId);
          const useful = dragId !== null && drop !== null && drop !== from && drop !== from + 1;
          const showBefore = useful && drop === i;
          const showAfter = useful && drop === i + 1 && i === z.tail - 1;
          // A thin rule where the pinned head ends and where the pinned tail begins.
          const divider = (i === z.head && i > 0) || (i === z.tail && i > z.head) ? "mt-1 border-t border-zinc-800 pt-1" : "";
          return (
            <li key={l.id} className={divider}>
              <div
                data-layer-index={i}
                draggable={movable}
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
                  setDrop(gapAt(e.currentTarget, e.clientY, i));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop();
                }}
                className={`group relative flex items-center gap-0.5 rounded py-1 pl-0.5 pr-1 text-xs ${selected ? "bg-sky-900/50 text-white" : "text-zinc-300 hover:bg-zinc-800"} ${dragId === l.id ? "opacity-40" : ""}`}
              >
                {showBefore && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-sky-400" />}
                {showAfter && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-sky-400" />}
                {movable ? (
                  <span
                    className="grid size-5 cursor-grab touch-none place-items-center text-zinc-600 group-hover:text-zinc-400 pointer-coarse:size-8"
                    title="Drag to reorder"
                    onPointerDown={(e) => {
                      if (e.pointerType === "mouse") return;
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDragId(l.id);
                    }}
                    onPointerMove={touchMove}
                    onPointerUp={(e) => e.pointerType !== "mouse" && onDrop()}
                    onPointerCancel={endDrag}
                  >
                    <GripIcon />
                  </span>
                ) : (
                  <span
                    className={`grid size-5 place-items-center text-zinc-700 ${isCanvas ? "invisible" : ""}`}
                    title={pinnedHead ? "Pinned: every drawing layer depends on it" : "Pinned to the end: it finishes the picture"}
                  >
                    <PinIcon />
                  </span>
                )}
                {isCanvas || (pinnedHead && l.enabled) ? (
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
                  title={`${name} (id ${l.id})${movable ? "" : ", pinned"}`}
                  onClick={() => dispatch({ type: "select", layerId: l.id })}
                  onKeyDown={(e) => {
                    // Alt+arrows reorder from the keyboard, the counterpart of dragging.
                    if (!movable || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
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
                {!pinnedHead && (
                  <span className={`flex items-center ${selected ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
                    {movable && (
                      <>
                        {/* aria-disabled, not disabled: a button that disables itself under focus drops focus to <body>. */}
                        <button
                          type="button"
                          className={iconBtn}
                          aria-label={`Move ${name} up`}
                          title="Move up (Alt+Up)"
                          aria-disabled={i <= z.head}
                          onClick={() => i > z.head && dispatch({ type: "moveLayer", layerId: l.id, dir: -1 })}
                        >
                          <UpIcon />
                        </button>
                        <button
                          type="button"
                          className={iconBtn}
                          aria-label={`Move ${name} down`}
                          title="Move down (Alt+Down)"
                          aria-disabled={i >= z.tail - 1}
                          onClick={() => i < z.tail - 1 && dispatch({ type: "moveLayer", layerId: l.id, dir: 1 })}
                        >
                          <DownIcon />
                        </button>
                        <button type="button" className={iconBtn} aria-label={`Duplicate ${name}`} title="Duplicate" disabled={full} onClick={() => dispatch({ type: "duplicateLayer", layerId: l.id })}>
                          <CopyIcon />
                        </button>
                      </>
                    )}
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
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
