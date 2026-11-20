import type { Distribution, ParamSetting, ParamSpec, ParamValue, Variation } from "@gridloom/core";
import { useId, useRef, useState } from "react";
import { MAX_WEIGHT } from "../state/limits.ts";
import { ResetIcon } from "./icons.tsx";
import { isDefaultSetting, weightShares } from "./params.ts";
import type { OptionSwatches } from "./Swatches.tsx";
import { Swatch, SwatchPicker } from "./Swatches.tsx";
import { SLIDER_KEYS } from "./vary.ts";
import { DISTRIBUTIONS, VaryRange } from "./VaryRange.tsx";

interface Props {
  readonly name: string;
  readonly spec: ParamSpec;
  readonly setting: ParamSetting | undefined;
  readonly resolved: ParamValue | undefined;
  /** Enum options drawn as color swatches instead of a dropdown. */
  readonly swatches?: OptionSwatches | undefined;
  readonly onChange: (setting: ParamSetting, record: boolean) => void;
  readonly onCheckpoint: () => void;
  /** Back to the module default (drops value, variation and lock). */
  readonly onReset: () => void;
  /** Show the help text under the label (the panel's Help toggle). */
  readonly showHelp?: boolean;
}


const input = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
const chip = (on: boolean): string =>
  `rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${on ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`;

function format(v: ParamValue | undefined): string {
  // Up to 4 decimals, trailing zeros dropped, so small steps like 0.0012 stay visible.
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  return String(v ?? "");
}

const distLabel = (d: Distribution): string => DISTRIBUTIONS.find((x) => x.id === d)?.label ?? d;

function defaultVary(spec: ParamSpec, value: ParamValue): Variation | null {
  switch (spec.kind) {
    case "number":
    case "int": {
      const v = typeof value === "number" ? value : spec.default;
      const span = (spec.max - spec.min) * 0.25;
      return { kind: "range", min: Math.max(spec.min, v - span), max: Math.min(spec.max, v + span), dist: "uniform" };
    }
    case "enum":
      return { kind: "weights", weights: Object.fromEntries(spec.options.map((o) => [o, 1])) };
    case "bool":
      return { kind: "weights", weights: { false: 1, true: 1 } };
    case "color":
      return null;
  }
}

export function ParamRow({ name, spec, setting, resolved, swatches, onChange, onCheckpoint, onReset, showHelp = false }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  const helpShown = !!spec.help && (showHelp || helpOpen);
  const value = setting?.value ?? spec.default;
  const vary = setting?.vary;
  const locked = setting?.locked === true;
  const varying = !!vary && !locked;
  const fixedOnly = (s: ParamSetting): ParamSetting => ({ value: s.value });
  const withValue = (v: ParamValue): ParamSetting => ({ ...(setting ?? { value }), value: v });
  const withVary = (vr: Variation): ParamSetting => ({ ...(setting ?? { value }), vary: vr });
  const canVary = spec.kind !== "color";
  const rowRef = useRef<HTMLDivElement | null>(null);
  const reset = () => {
    onReset();
    // The reset button leaves with the change; keep focus in this row instead of dropping it to <body>.
    rowRef.current?.querySelector<HTMLElement>("button:not([data-reset]), input, select")?.focus();
  };

  const toggleVary = () => {
    if (vary) return onChange(fixedOnly(setting ?? { value }), true);
    const dv = defaultVary(spec, value);
    if (dv) onChange({ value, vary: dv }, true);
  };
  const toggleLock = () => {
    const base = setting ?? { value };
    const { locked: _l, ...rest } = base;
    onChange(locked ? rest : { ...rest, locked: true }, true);
  };

  const isNumeric = spec.kind === "number" || spec.kind === "int";
  const step = spec.kind === "int" ? 1 : spec.kind === "number" ? spec.step : 1;
  const numberBox = (v: number, onValue: (n: number) => void, label: string) =>
    isNumeric && (
      <input
        type="number"
        className={`${input} w-16 font-mono`}
        min={spec.min}
        max={spec.max}
        step={step}
        value={v}
        aria-label={label}
        onChange={(e) => e.target.value !== "" && onValue(Number(e.target.value))}
      />
    );

  return (
    <div ref={rowRef} className="border-b border-zinc-800/80 py-2" data-param={name}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="truncate text-xs text-zinc-300">{spec.label}</span>
          {spec.help && (
            <button
              type="button"
              className={`grid size-3.5 shrink-0 place-items-center rounded-full text-[9px] font-semibold ring-1 focus-visible:outline-none focus-visible:ring-sky-500 ${helpShown ? "bg-zinc-600 text-white ring-zinc-500" : "text-zinc-500 ring-zinc-700 hover:text-zinc-200"}`}
              aria-label={`About ${spec.label}`}
              aria-expanded={helpShown}
              aria-controls={helpId}
              onClick={() => setHelpOpen((o) => !o)}
            >
              i
            </button>
          )}
        </span>
        {varying && (
          <span className="font-mono text-[11px] text-sky-400" title="This seed's value">
            = {format(resolved)}
          </span>
        )}
        {canVary && (
          <button type="button" className={chip(!!vary)} onClick={toggleVary} aria-pressed={!!vary} title="Let the hash choose this value">
            vary
          </button>
        )}
        {vary && (
          <button type="button" className={chip(locked)} onClick={toggleLock} aria-pressed={locked} title="Ignore variation, use the fixed value">
            lock
          </button>
        )}
        {!isDefaultSetting(spec, setting) && (
          <button
            type="button"
            className="grid size-5 place-items-center rounded text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
            data-reset=""
            onClick={reset}
            aria-label={`Reset ${spec.label} to default`}
            title={`Reset to default (${format(spec.default)})`}
          >
            <ResetIcon />
          </button>
        )}
      </div>
      {helpShown && (
        <p id={helpId} className="mb-1.5 text-[11px] leading-snug text-zinc-500">
          {spec.help}
        </p>
      )}

      {isNumeric && varying && vary.kind === "range" && (
        <>
          <VaryRange
            spec={spec}
            vary={vary}
            resolved={typeof resolved === "number" ? resolved : undefined}
            onChange={(vr, record) => onChange(withVary(vr), record)}
            onCheckpoint={onCheckpoint}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            {/* Unclamped while typing ("12" passes through "1"); core orders the ends itself. */}
            {numberBox(vary.min, (n) => onChange(withVary({ ...vary, min: n }), true), `${spec.label}, lowest value`)}
            <span>to</span>
            {numberBox(vary.max, (n) => onChange(withVary({ ...vary, max: n }), true), `${spec.label}, highest value`)}
            <select
              className={input}
              value={vary.dist}
              aria-label={`${spec.label}, distribution`}
              onChange={(e) => onChange(withVary({ ...vary, dist: e.target.value as Distribution }), true)}
            >
              {DISTRIBUTIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500" title="Used when the param is locked">
            <span>if locked</span>
            {numberBox(Number(value), (n) => onChange(withValue(n), true), `${spec.label}, fixed value`)}
          </label>
        </>
      )}

      {isNumeric && !varying && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="range"
              className="flex-1 accent-sky-500"
              min={spec.min}
              max={spec.max}
              step={step}
              value={Number(value)}
              onPointerDown={onCheckpoint}
              onKeyDown={(e) => !e.repeat && SLIDER_KEYS.has(e.key) && onCheckpoint()}
              onChange={(e) => onChange(withValue(Number(e.target.value)), false)}
              aria-label={spec.label}
            />
            {numberBox(Number(value), (n) => onChange(withValue(n), true), `${spec.label}, value`)}
          </div>
          {vary?.kind === "range" && (
            <p className="mt-1 text-[11px] text-zinc-500">
              Locked. Varies {format(vary.min)} to {format(vary.max)}, {distLabel(vary.dist)}, when unlocked.
            </p>
          )}
        </>
      )}

      {spec.kind === "enum" &&
        (swatches ? (
          <div>
            {varying && <p className="mb-1 text-[11px] text-zinc-500">Outlined: used when locked. The seed draws by the weights below.</p>}
            <SwatchPicker
              label={spec.label}
              options={spec.options}
              swatches={swatches}
              value={String(value)}
              drawn={varying && typeof resolved === "string" ? resolved : undefined}
              onPick={(o) => onChange(withValue(o), true)}
            />
          </div>
        ) : (
          <select
            className={`${input} w-full ${varying ? "opacity-40 hover:opacity-100" : ""}`}
            value={String(value)}
            aria-label={spec.label}
            onChange={(e) => onChange(withValue(e.target.value), true)}
          >
            {spec.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}

      {spec.kind === "bool" && (
        <label className={`flex items-center gap-2 text-xs text-zinc-400 ${varying ? "opacity-40" : ""}`}>
          <input
            type="checkbox"
            className="accent-sky-500"
            checked={value === true}
            onChange={(e) => onChange(withValue(e.target.checked), true)}
          />
          {value === true ? "on" : "off"}
        </label>
      )}

      {(spec.kind === "enum" || spec.kind === "bool") && vary?.kind === "weights" && (() => {
        const options = spec.kind === "enum" ? spec.options : ["false", "true"];
        const shares = weightShares(options, vary.weights);
        const drawn = varying ? String(resolved) : null;
        return (
          <div className="mt-1.5 flex flex-col gap-1">
            {options.map((o, i) => {
              const share = shares[i] ?? 0;
              const isDrawn = o === drawn;
              return (
                <label key={o} className="flex items-center gap-2 text-[11px] text-zinc-400" title={`${o}: ${Math.round(share * 100)}% of seeds`}>
                  {swatches?.[o] ? <Swatch colors={swatches[o]} className="h-3 w-16 shrink-0" /> : <span className={`w-16 shrink-0 truncate ${isDrawn ? "text-zinc-100" : ""}`}>{o}</span>}
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                    <span className={`absolute inset-y-0 left-0 rounded-full ${isDrawn ? "bg-sky-400" : "bg-sky-700"}`} style={{ width: `${share * 100}%` }} />
                  </span>
                  <span className={`w-8 shrink-0 text-right font-mono tabular-nums ${share === 0 ? "text-zinc-600" : isDrawn ? "text-zinc-100" : ""}`}>{Math.round(share * 100)}%</span>
                  <input
                    type="number"
                    className={`${input} w-12 font-mono`}
                    min={0}
                    max={MAX_WEIGHT}
                    step={1}
                    value={vary.weights[o] ?? 0}
                    aria-label={`${spec.label}, weight of ${o}`}
                    onChange={(e) =>
                      onChange(withVary({ kind: "weights", weights: { ...vary.weights, [o]: Math.min(MAX_WEIGHT, Math.max(0, Number(e.target.value) || 0)) } }), true)
                    }
                  />
                </label>
              );
            })}
          </div>
        );
      })()}

      {spec.kind === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-6 w-10 cursor-pointer rounded bg-transparent"
            value={String(value)}
            aria-label={spec.label}
            onPointerDown={onCheckpoint}
            onChange={(e) => onChange(withValue(e.target.value), false)}
          />
          <span className="font-mono text-xs text-zinc-400">{String(value)}</span>
        </div>
      )}
    </div>
  );
}
