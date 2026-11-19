import type { Layer, ParamSetting, ResolvedLayer } from "@gridloom/core";
import { defaultRegistry, getModule } from "@gridloom/core";
import { ParamRow } from "./ParamRow.tsx";

interface Props {
  readonly layer: Layer | undefined;
  readonly resolved: ResolvedLayer | undefined;
  readonly onChange: (layerId: string, name: string, setting: ParamSetting, record: boolean) => void;
  readonly onCheckpoint: () => void;
}

export function ParamPanel({ layer, resolved, onChange, onCheckpoint }: Props) {
  if (!layer) return <p className="p-3 text-xs text-zinc-500">Select a layer.</p>;
  const def = getModule(defaultRegistry, layer.module);
  if (!def) return <p className="p-3 text-xs text-red-400">Unknown module {layer.module}</p>;
  return (
    <div className="px-3 pb-6">
      <h2 className="pt-3 text-sm font-semibold text-zinc-100">{def.label}</h2>
      <p className="mb-2 text-[11px] leading-snug text-zinc-500">{def.description}</p>
      {Object.entries(def.params).map(([name, spec]) => (
        <ParamRow
          key={`${layer.id}:${name}`}
          name={name}
          spec={spec}
          setting={layer.params[name]}
          resolved={resolved?.values[name]}
          onChange={(s, record) => onChange(layer.id, name, s, record)}
          onCheckpoint={onCheckpoint}
        />
      ))}
    </div>
  );
}
