import { useLang } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import type { Distribution, IntSpec, NumberSpec, Variation } from "@tramaloom/core";
import { useMemo, useRef } from "react";
import { densityCurve, SLIDER_KEYS } from "./vary.ts";

type RangeVariation = Extract<Variation, { kind: "range" }>;

interface Props {
  readonly spec: NumberSpec | IntSpec;
  readonly vary: RangeVariation;
  /** This seed's value, marked on the track. */
  readonly resolved: number | undefined;
  readonly onChange: (vary: RangeVariation, record: boolean) => void;
  readonly onCheckpoint: () => void;
}

const SAMPLES = 48;

/**
 * The range a seed can pick from, drawn on one track: two thumbs set the ends,
 * the curve above shows how likely each value is, the tick marks this seed's pick.
 * Both thumbs are native range inputs, so keyboard and screen readers work as usual.
 */
export function VaryRange({ spec, vary, resolved, onChange, onCheckpoint }: Props) {
  const { t } = useLang();
  const span = spec.max - spec.min || 1;
  const pct = (v: number) => ((Math.min(spec.max, Math.max(spec.min, v)) - spec.min) / span) * 100;
  // Typed ends may be out of order for a moment; core orders them, so the drawing does too.
  const lo = pct(Math.min(vary.min, vary.max));
  const hi = pct(Math.max(vary.min, vary.max));
  const step = spec.kind === "int" ? 1 : spec.step;

  const curve = useMemo(() => {
    const ys = densityCurve(vary.dist, SAMPLES);
    const xAt = (i: number) => lo + ((i + 0.5) / SAMPLES) * (hi - lo);
    const top = ys.map((y, i) => `L${xAt(i).toFixed(2)},${(20 - y * 18).toFixed(2)}`).join("");
    return `M${lo.toFixed(2)},20${top}L${hi.toFixed(2)},20Z`;
  }, [vary.dist, lo, hi]);

  // Pointer drag state: `null` when no drag, "pending" until the drag picks an end.
  const drag = useRef<"min" | "max" | "pending" | null>(null);
  const setEnd = (end: "min" | "max", v: number, record: boolean) => {
    // Stacked thumbs: only the top one takes the pointer. When the ends meet, the
    // drag direction decides which end moves, and that choice holds for the rest
    // of the drag, so both ends stay reachable. Keyboard arrows just clamp.
    let target = end;
    if (drag.current === "pending" && vary.min === vary.max) {
      if (v === vary.min) return;
      target = v < vary.min ? "min" : "max";
      drag.current = target;
    } else if (drag.current === "min" || drag.current === "max") {
      target = drag.current;
    } else if (drag.current === "pending") {
      drag.current = end;
    }
    const next = target === "min" ? { ...vary, min: Math.min(v, vary.max) } : { ...vary, max: Math.max(v, vary.min) };
    if (next.min !== vary.min || next.max !== vary.max) onChange(next, record);
  };

  // When both thumbs meet at the top end, the low one sits above (the drag latch covers the rest).
  const loOnTop = lo > 50;
  const thumb = (end: "min" | "max", z: string) => (
    <input
      type="range"
      className={`dual-range absolute inset-0 w-full ${z}`}
      min={spec.min}
      max={spec.max}
      step={step}
      value={end === "min" ? vary.min : vary.max}
      onPointerDown={() => {
        drag.current = "pending";
        onCheckpoint();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onBlur={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => !e.repeat && SLIDER_KEYS.has(e.key) && onCheckpoint()}
      onChange={(e) => setEnd(end, Number(e.target.value), false)}
      aria-label={`${spec.label}, ${end === "min" ? "lowest" : "highest"} value`}
    />
  );

  return (
    <div className="flex-1">
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="block h-4 w-full" aria-hidden="true">
        <path d={curve} className="fill-sky-500/25 stroke-sky-400/70" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-700" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-500" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
        {resolved !== undefined && (
          <div
            className="pointer-events-none absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded bg-white/90"
            style={{ left: `${pct(resolved)}%` }}
            title={t("vary.seedValue")}
          />
        )}
        {thumb("min", loOnTop ? "z-20" : "z-10")}
        {thumb("max", loOnTop ? "z-10" : "z-20")}
      </div>
    </div>
  );
}

export const DISTRIBUTIONS: readonly { readonly id: Distribution; readonly label: MessageKey }[] = [
  { id: "uniform", label: "vary.uniform" },
  { id: "low", label: "vary.low" },
  { id: "high", label: "vary.high" },
  { id: "gaussian", label: "vary.gaussian" },
];
