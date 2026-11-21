import type { ArtDocument, ParamSetting, TraitBin, TraitDef } from "@gridloom/core";
import { computeTraits, defaultRegistry, expectedDistribution, layerDef, traitLabel } from "@gridloom/core";
import { useEffect, useMemo, useState } from "react";
import { MAX_WEIGHT } from "../../state/limits.ts";
import { MAX_BINS, MAX_TRAITS } from "../../state/schema.ts";
import type { Action } from "../../state/store.ts";
import { pct, ShareBar } from "./ShareBar.tsx";
import { useLang } from "../../i18n/i18n.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly dispatch: (a: Action) => void;
}

const field = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";

interface Source {
  readonly key: string;
  readonly layerId: string;
  readonly param: string;
  readonly label: string;
  readonly kind: string;
  readonly varying: boolean;
  readonly options?: readonly string[];
}

function sources(doc: ArtDocument): Source[] {
  return doc.layers.flatMap((l) => {
    const def = layerDef(defaultRegistry, l);
    if (!def || l.module === "canvas") return [];
    return Object.entries(def.params)
      .filter(([, spec]) => spec.kind !== "color")
      .map(([param, spec]) => ({
        key: `${l.id}/${param}`,
        layerId: l.id,
        param,
        label: `${l.id} / ${spec.label}`,
        kind: spec.kind,
        varying: !!l.params[param]?.vary && !l.params[param]?.locked,
        ...(spec.kind === "enum" ? { options: spec.options } : {}),
      }));
  });
}

/** Default bins for a numeric source: thirds of its varying range. */
function defaultBins(doc: ArtDocument, layerId: string, param: string, names: readonly [string, string, string]): TraitBin[] {
  const layer = doc.layers.find((l) => l.id === layerId);
  const spec = layer ? layerDef(defaultRegistry, layer)?.params[param] : undefined;
  if (!spec || (spec.kind !== "number" && spec.kind !== "int")) return [];
  const vary = layer?.params[param]?.vary;
  const lo = vary?.kind === "range" ? Math.min(vary.min, vary.max) : spec.min;
  const hi = vary?.kind === "range" ? Math.max(vary.min, vary.max) : spec.max;
  const round = (v: number) => (spec.kind === "int" ? Math.floor(v) : Number(v.toFixed(3)));
  const third = (hi - lo) / 3;
  return [
    { label: names[0], upTo: round(lo + third) },
    { label: names[1], upTo: round(lo + 2 * third) },
    { label: names[2] },
  ];
}

const total0 = (w: Readonly<Record<string, number>>) => Object.values(w).every((x) => x <= 0);

function TraitEditor({
  doc,
  trait,
  all,
  onChange,
  onRemove,
  onWeights,
}: {
  readonly doc: ArtDocument;
  readonly trait: TraitDef;
  readonly all: readonly Source[];
  /** Returns false when the change was refused (a duplicate name). */
  readonly onChange: (t: TraitDef) => boolean;
  readonly onRemove: () => void;
  readonly onWeights: (weights: Record<string, number>) => void;
}) {
  const { t } = useLang();
  const binNames = [t("traits.low"), t("traits.mid"), t("traits.high")] as const;
  // Text fields edit a draft and commit on blur/Enter, so typing is one undo step.
  const [name, setName] = useState(trait.name);
  const [nameError, setNameError] = useState<string | null>(null);
  useEffect(() => setName(trait.name), [trait.name]);
  const src = all.find((s) => s.layerId === trait.layerId && s.param === trait.param);
  const numeric = src?.kind === "number" || src?.kind === "int";
  const expected = expectedDistribution(doc, trait);
  const setting: ParamSetting | undefined = doc.layers.find((l) => l.id === trait.layerId)?.params[trait.param];
  const weights = setting?.vary?.kind === "weights" && !setting.locked ? setting.vary.weights : null;
  const bins = trait.bins ?? [];

  const commitName = () => {
    const n = name.trim().slice(0, 40);
    if (n && n !== trait.name && onChange({ ...trait, name: n })) return setNameError(null);
    if (n && n !== trait.name) setNameError(t("traits.nameUsed", { name: n }));
    setName(trait.name);
  };
  const setBins = (next: readonly TraitBin[]) => {
    const { bins: _b, ...rest } = trait;
    onChange(next.length ? { ...rest, bins: next } : rest);
  };

  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${field} w-32 font-semibold`}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={t("traits.name")}
        />
        <select
          className={`${field} max-w-56`}
          value={`${trait.layerId}/${trait.param}`}
          onChange={(e) => {
            const s = all.find((x) => x.key === e.target.value);
            if (!s) return;
            const b = s.kind === "number" || s.kind === "int" ? defaultBins(doc, s.layerId, s.param, binNames) : [];
            onChange({ name: trait.name, layerId: s.layerId, param: s.param, ...(b.length ? { bins: b } : {}) });
          }}
          aria-label={t("traits.source")}
        >
          {!src && <option value={`${trait.layerId}/${trait.param}`}>{t("traits.missing", { source: `${trait.layerId}/${trait.param}` })}</option>}
          {all.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
              {s.varying ? "" : t("traits.fixedSuffix")}
            </option>
          ))}
        </select>
        {src && !src.varying && <span className="text-[11px] text-amber-300">{t("traits.fixed")}</span>}
        <div className="flex-1" />
        <button type="button" className="rounded px-1.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" onClick={onRemove}>
          {t("traits.remove")}
        </button>
      </div>

      {numeric && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span>{t("traits.bins")}</span>
          {bins.map((b, i) => (
            // Keyed by content: when the bins change underneath, the fields remount with the real values.
            <span key={`${i}:${b.label}:${b.upTo ?? ""}`} className="flex items-center gap-1 rounded bg-zinc-900 px-1 py-0.5">
              <input
                className={`${field} w-20`}
                defaultValue={b.label}
                maxLength={40}
                onBlur={(e) => {
                  const label = e.target.value.trim().slice(0, 40);
                  if (label && label !== b.label) setBins(bins.map((x, j) => (j === i ? { ...x, label } : x)));
                  else e.target.value = b.label;
                }}
                aria-label={t("traits.binLabel", { n: i + 1 })}
              />
              {b.upTo !== undefined ? (
                <>
                  <span>{t("traits.upTo")}</span>
                  <input
                    type="number"
                    className={`${field} w-16`}
                    defaultValue={b.upTo}
                    onBlur={(e) => {
                      const upTo = Number(e.target.value);
                      // Bounds must stay strictly between the neighbours.
                      const lo = bins[i - 1]?.upTo ?? -Infinity;
                      const hi = bins[i + 1]?.upTo ?? Infinity;
                      const ok = e.target.value.trim() !== "" && Number.isFinite(upTo) && upTo > lo && upTo < hi;
                      if (ok && upTo !== b.upTo) setBins(bins.map((x, j) => (j === i ? { ...x, upTo } : x)));
                      else e.target.value = String(b.upTo);
                    }}
                    aria-label={t("traits.binBound", { n: i + 1 })}
                  />
                </>
              ) : (
                <span>{t("traits.rest")}</span>
              )}
            </span>
          ))}
          {bins.length < MAX_BINS && (
            <button
              type="button"
              className="rounded bg-zinc-800 px-1.5 hover:bg-zinc-700"
              onClick={() => {
                const last = bins[bins.length - 1];
                if (!last) return setBins(defaultBins(doc, trait.layerId, trait.param, binNames));
                // Insert before the catch-all, one step above the previous bound.
                const prevUp = bins[bins.length - 2]?.upTo ?? 0;
                const step = src?.kind === "int" ? 1 : 0.1;
                const used = new Set(bins.map((b) => b.label));
                let k = bins.length;
                while (used.has(t("traits.binN", { n: k }))) k++;
                setBins([...bins.slice(0, -1), { label: t("traits.binN", { n: k }), upTo: Number((prevUp + step).toFixed(6)) }, last]);
              }}
            >
              {t("traits.addBin")}
            </button>
          )}
          {bins.length > 0 && (
            <button type="button" className="rounded px-1.5 hover:bg-zinc-800" onClick={() => setBins(bins.length > 1 ? [...bins.slice(0, -2), ...bins.slice(-1)] : [])}>
              {t("traits.removeBin")}
            </button>
          )}
          {bins.length === 0 && <span className="text-zinc-500">{t("traits.noBins")}</span>}
        </div>
      )}

      {nameError && <p className="mt-1 text-[11px] text-red-300">{nameError}</p>}
      {!src && <p className="mt-1 text-[11px] text-amber-300">{t("traits.gone")}</p>}

      <div className="mt-3 space-y-1">
        {weights ? (
          // Rows come from the weights themselves, so a weight of 0 stays visible and editable.
          (() => {
            const keys =
              src?.options
                ? src.options
                : src?.kind === "bool"
                  ? ["false", "true"]
                  : Object.keys(weights).sort((x, y) => Number(x) - Number(y));
            const total = keys.reduce((acc, k) => acc + Math.max(0, weights[k] ?? 0), 0);
            const toValue = (k: string) => (src?.kind === "bool" ? k === "true" : src?.kind === "enum" ? k : Number(k));
            return keys.map((k) => {
              const w = weights[k] ?? 0;
              const shown = String(traitLabel(trait, toValue(k)));
              const share = total > 0 ? Math.max(0, w) / total : 0;
              return (
                <div key={k} className="flex items-center gap-2 text-[11px]">
                  <span className="w-24 truncate text-zinc-300" title={shown === k ? k : `${k}: ${shown}`}>
                    {shown === k ? k : `${k} (${shown})`}
                  </span>
                  <ShareBar share={share} />
                  <span className="w-14 text-right tabular-nums text-zinc-400">{pct(share)}</span>
                  <input
                    type="number"
                    min={0}
                    max={MAX_WEIGHT}
                    className={`${field} w-16`}
                    defaultValue={w}
                    key={`${k}:${w}`}
                    onBlur={(e) => {
                      const raw = Number(e.target.value);
                      const next = Math.min(MAX_WEIGHT, Math.max(0, Math.round(raw)));
                      if (e.target.value.trim() === "" || !Number.isFinite(raw)) e.target.value = String(w);
                      else if (next !== w) onWeights({ ...weights, [k]: next });
                      else e.target.value = String(w);
                    }}
                    aria-label={t("traits.weightFor", { value: k })}
                    title={t("traits.weightHint")}
                  />
                </div>
              );
            });
          })()
        ) : expected ? (
          Object.entries(expected.shares).map(([value, share]) => (
            <div key={value} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 truncate text-zinc-300" title={value}>
                {value}
              </span>
              <ShareBar share={share} />
              <span className="w-14 text-right tabular-nums text-zinc-400">
                {expected.exact ? "" : "~"}
                {pct(share)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-zinc-500">{t("traits.continuous")}</p>
        )}
        {weights && total0(weights) && <p className="text-[11px] text-amber-300">{t("traits.allZero")}</p>}
        {weights && (
          <p className="text-[10px] text-zinc-500">
            {t("traits.weightsNote")} <span className="text-amber-200/80">{t("traits.weightsSettle")}</span> {t("traits.weightsKeep")}
          </p>
        )}
      </div>
    </div>
  );
}

export function TraitsTab({ doc, hash, dispatch }: Props) {
  const { t } = useLang();
  const traits = doc.traits ?? [];
  const all = useMemo(() => sources(doc), [doc]);
  const current = useMemo(() => {
    try {
      return computeTraits(doc, hash);
    } catch {
      return {};
    }
  }, [doc, hash]);
  const set = (next: readonly TraitDef[]) => dispatch({ type: "setTraits", traits: next });

  const add = () => {
    const used = new Set(traits.map((x) => `${x.layerId}/${x.param}`));
    const s = all.find((x) => x.varying && !used.has(x.key)) ?? all.find((x) => !used.has(x.key));
    if (!s) return;
    const names = new Set(traits.map((x) => x.name));
    let n = 1;
    while (names.has(t("traits.traitN", { n }))) n++;
    const bins = s.kind === "number" || s.kind === "int" ? defaultBins(doc, s.layerId, s.param, [t("traits.low"), t("traits.mid"), t("traits.high")]) : [];
    set([...traits, { name: t("traits.traitN", { n }), layerId: s.layerId, param: s.param, ...(bins.length ? { bins } : {}) }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-400">{t("traits.thisSeed")}</span>
        {Object.entries(current).map(([k, v]) => (
          <span key={k} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
            {k}: {String(v)}
          </span>
        ))}
        {traits.length === 0 && <span className="text-zinc-500">{t("traits.none")}</span>}
      </div>
      <p className="text-[11px] text-zinc-500">
        {t("traits.about")}
        {traits.length > 8 && <span className="text-amber-300">{t("traits.tooMany")}</span>}
      </p>
      {traits.map((trait, i) => (
        <TraitEditor
          key={`${i}:${trait.name}:${trait.layerId}/${trait.param}`}
          doc={doc}
          trait={trait}
          all={all}
          onChange={(next) => {
            if (next.name !== trait.name && traits.some((x, j) => j !== i && x.name === next.name)) return false;
            set(traits.map((x, j) => (j === i ? next : x)));
            return true;
          }}
          onRemove={() => set(traits.filter((_, j) => j !== i))}
          onWeights={(weights) => {
            const setting = doc.layers.find((l) => l.id === trait.layerId)?.params[trait.param];
            if (!setting) return;
            dispatch({
              type: "setParam",
              layerId: trait.layerId,
              name: trait.param,
              setting: { ...setting, vary: { kind: "weights", weights } },
              record: true,
            });
          }}
        />
      ))}
      <button
        type="button"
        className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40"
        onClick={add}
        disabled={traits.length >= MAX_TRAITS || all.length === 0}
      >
        {t("traits.add")}
      </button>
    </div>
  );
}
