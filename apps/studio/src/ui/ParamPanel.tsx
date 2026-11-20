import type { Layer, ParamSetting, ResolvedLayer } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { isDefaultSetting } from "./params.ts";
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

export function ParamPanel({ layer, resolved, onChange, onCheckpoint, onResetParam, onResetLayer }: Props) {
  if (!layer) return <p className="p-3 text-xs text-zinc-500">Select a layer.</p>;
  const def = getModule(defaultRegistry, layer.module);
  if (!def) return <p className="p-3 text-xs text-red-400">Unknown module {layer.module}</p>;
  const changed = Object.entries(def.params).some(([name, spec]) => !isDefaultSetting(spec, layer.params[name]));
  return (
    <div className="px-3 pb-6">
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
      {Object.entries(def.params).map(([name, spec]) => (
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
      ))}
    </div>
  );
}
