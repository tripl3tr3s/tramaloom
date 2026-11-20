import type { Distribution, ParamSetting, ParamSpec, ParamValue, Variation } from "@gridloom/core";
import { MAX_WEIGHT } from "../state/limits.ts";
import type { OptionSwatches } from "./Swatches.tsx";
import { Swatch, SwatchPicker } from "./Swatches.tsx";

interface Props {
  readonly name: string;
  readonly spec: ParamSpec;
  readonly setting: ParamSetting | undefined;
  readonly resolved: ParamValue | undefined;
  /** Enum options drawn as color swatches instead of a dropdown. */
  readonly swatches?: OptionSwatches | undefined;
  readonly onChange: (setting: ParamSetting, record: boolean) => void;
  readonly onCheckpoint: () => void;
}

const SLIDER_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

const DISTS: readonly Distribution[] = ["uniform", "low", "high", "gaussian"];
const input = "rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500";
const chip = (on: boolean): string =>
  `rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${on ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"}`;

function format(v: ParamValue | undefined): string {
  // Up to 4 decimals, trailing zeros dropped, so small steps like 0.0012 stay visible.
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  return String(v ?? "");
}

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

export function ParamRow({ name, spec, setting, resolved, swatches, onChange, onCheckpoint }: Props) {
  const value = setting?.value ?? spec.default;
  const vary = setting?.vary;
  const locked = setting?.locked === true;
  const fixedOnly = (s: ParamSetting): ParamSetting => ({ value: s.value });
  const withValue = (v: ParamValue): ParamSetting => ({ ...(setting ?? { value }), value: v });
  const withVary = (vr: Variation): ParamSetting => ({ ...(setting ?? { value }), vary: vr });
  const canVary = spec.kind !== "color";

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

  return (
    <div className="border-b border-zinc-800/80 py-2" data-param={name}>
      <div className="mb-1 flex items-center gap-2">
        <span className="flex-1 truncate text-xs text-zinc-300" title={spec.help ?? spec.label}>
          {spec.label}
        </span>
        {vary && !locked && <span className="font-mono text-[11px] text-sky-400">= {format(resolved)}</span>}
        {canVary && (
          <button type="button" className={chip(!!vary)} onClick={toggleVary} title="Let the hash choose this value">
            vary
          </button>
        )}
        {vary && (
          <button type="button" className={chip(locked)} onClick={toggleLock} title="Ignore variation, use the fixed value">
            lock
          </button>
        )}
      </div>

      <div
        className={vary && !locked ? "opacity-40 transition-opacity hover:opacity-100" : ""}
        title={vary && !locked ? "Fixed value, used when locked" : undefined}
      >
      {(spec.kind === "number" || spec.kind === "int") && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="flex-1 accent-sky-500"
            min={spec.min}
            max={spec.max}
            step={spec.kind === "int" ? 1 : spec.step}
            value={Number(value)}
            onPointerDown={onCheckpoint}
            onKeyDown={(e) => !e.repeat && SLIDER_KEYS.has(e.key) && onCheckpoint()}
            onChange={(e) => onChange(withValue(Number(e.target.value)), false)}
            aria-label={spec.label}
          />
          <input
            type="number"
            className={`${input} w-16 font-mono`}
            min={spec.min}
            max={spec.max}
            step={spec.kind === "int" ? 1 : spec.step}
            value={Number(value)}
            onChange={(e) => e.target.value !== "" && onChange(withValue(Number(e.target.value)), true)}
          />
        </div>
      )}
      </div>
      {(spec.kind === "number" || spec.kind === "int") && vary?.kind === "range" && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span>from</span>
          <input
            type="number"
            className={`${input} w-16 font-mono`}
            min={spec.min}
            max={spec.max}
            step={spec.kind === "int" ? 1 : spec.step}
            value={vary.min}
            onChange={(e) => onChange(withVary({ ...vary, min: Number(e.target.value) }), true)}
          />
          <span>to</span>
          <input
            type="number"
            className={`${input} w-16 font-mono`}
            min={spec.min}
            max={spec.max}
            step={spec.kind === "int" ? 1 : spec.step}
            value={vary.max}
            onChange={(e) => onChange(withVary({ ...vary, max: Number(e.target.value) }), true)}
          />
          <select
            className={input}
            value={vary.dist}
            onChange={(e) => onChange(withVary({ ...vary, dist: e.target.value as Distribution }), true)}
          >
            {DISTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {spec.kind === "enum" &&
        (swatches ? (
          <div>
            {vary && !locked && <p className="mb-1 text-[11px] text-zinc-500">Outlined: used when locked. The seed draws by the weights below.</p>}
            <SwatchPicker
              label={spec.label}
              options={spec.options}
              swatches={swatches}
              value={String(value)}
              drawn={vary && !locked && typeof resolved === "string" ? resolved : undefined}
              onPick={(o) => onChange(withValue(o), true)}
            />
          </div>
        ) : (
          <select
            className={`${input} w-full ${vary && !locked ? "opacity-40 hover:opacity-100" : ""}`}
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
        <label className={`flex items-center gap-2 text-xs text-zinc-400 ${vary && !locked ? "opacity-40" : ""}`}>
          <input
            type="checkbox"
            className="accent-sky-500"
            checked={value === true}
            onChange={(e) => onChange(withValue(e.target.checked), true)}
          />
          {value === true ? "on" : "off"}
        </label>
      )}

      {(spec.kind === "enum" || spec.kind === "bool") && vary?.kind === "weights" && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {(spec.kind === "enum" ? spec.options : ["false", "true"]).map((o) => (
            <label key={o} className="flex items-center justify-between gap-1 text-[11px] text-zinc-400" title={o}>
              {swatches?.[o] ? <Swatch colors={swatches[o]} className="h-3 flex-1" /> : <span className="flex-1 truncate">{o}</span>}
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
          ))}
        </div>
      )}

      {spec.kind === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-6 w-10 cursor-pointer rounded bg-transparent"
            value={String(value)}
            onPointerDown={onCheckpoint}
            onChange={(e) => onChange(withValue(e.target.value), false)}
          />
          <span className="font-mono text-xs text-zinc-400">{String(value)}</span>
        </div>
      )}
    </div>
  );
}
