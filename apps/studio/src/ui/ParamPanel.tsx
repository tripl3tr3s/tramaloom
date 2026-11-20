import type { Layer, ParamSetting, ResolvedLayer } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { useState } from "react";
import { ChevronIcon } from "./icons.tsx";
import { groupParams, isDefaultSetting } from "./params.ts";
import { ParamRow } from "./ParamRow.tsx";
import { swatchesFor } from "./Swatches.tsx";

interface Props {
  readonly layer: Layer | undefined;
  readonly resolved: ResolvedLayer | undefined;
  readonly onChange: (layerId: string, name: string, setting: ParamSetting, record: boolean) => void;
  readonly onCheckpoint: () => void;
  readonly onResetParam: (layerId: string, name: string) => void;
  readonly onResetLayer: (layerId: string) => void;
}

const COLLAPSED_KEY = "gridloom.collapsedGroups";

/** Which groups this viewer folded away ("module/Group"). A convenience only, so storage failures are ignored. */
function useCollapsed(): readonly [ReadonlySet<string>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Private mode or blocked storage: the fold still works for this session.
      }
      return next;
    });
  return [collapsed, toggle];
}

export function ParamPanel({ layer, resolved, onChange, onCheckpoint, onResetParam, onResetLayer }: Props) {
  const [collapsed, toggle] = useCollapsed();
  if (!layer) return <p className="p-3 text-xs text-zinc-500">Select a layer.</p>;
  const def = getModule(defaultRegistry, layer.module);
  if (!def) return <p className="p-3 text-xs text-red-400">Unknown module {layer.module}</p>;
  const changed = Object.entries(def.params).some(([name, spec]) => !isDefaultSetting(spec, layer.params[name]));
  return (
    <div className="pb-24 pl-4 pr-3">
      <div className="flex items-baseline justify-between gap-2 pt-3">
        <h2 className="text-sm font-semibold text-zinc-100">{def.label}</h2>
        {/* aria-disabled, not disabled: the button would drop focus to <body> the moment it disabled itself. */}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-400"
          aria-disabled={!changed}
          onClick={() => changed && onResetLayer(layer.id)}
          title={changed ? "Reset every parameter of this layer to its default (undo with Ctrl+Z)" : "Every parameter is at its default"}
        >
          Reset all
        </button>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-zinc-500">{def.description}</p>
      {groupParams(def.params).map(({ title, names }) => {
        const rows = names.map((name) => {
          const spec = def.params[name];
          return (
            spec && (
              <ParamRow
                key={`${layer.id}:${name}`}
                name={name}
                spec={spec}
                setting={layer.params[name]}
                resolved={resolved?.values[name]}
                swatches={swatchesFor(layer.module, name)}
                onChange={(s, record) => onChange(layer.id, name, s, record)}
                onCheckpoint={onCheckpoint}
                onReset={() => onResetParam(layer.id, name)}
              />
            )
          );
        });
        if (title === null) return <div key="loose">{rows}</div>;
        const key = `${layer.module}/${title}`;
        const open = !collapsed.has(key);
        const bodyId = `params-${layer.id}-${title.replace(/\W+/g, "-")}`;
        const changedCount = names.filter((n) => {
          const spec = def.params[n];
          return spec && !isDefaultSetting(spec, layer.params[n]);
        }).length;
        return (
          <section key={title} className="mt-1">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => toggle(key)}
            >
              <span className={`transition-transform ${open ? "" : "-rotate-90"}`}>
                <ChevronIcon />
              </span>
              <span className="flex-1">{title}</span>
              {!open && changedCount > 0 && (
                <span className="rounded bg-zinc-800 px-1.5 py-px text-[10px] font-normal normal-case tracking-normal text-sky-300">
                  {changedCount} changed
                </span>
              )}
            </button>
            <div id={bodyId} hidden={!open}>
              {rows}
            </div>
          </section>
        );
      })}
    </div>
  );
}
