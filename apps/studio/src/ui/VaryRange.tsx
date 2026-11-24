import { useLang } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import type { Distribution, IntSpec, NumberSpec, Variation } from "@tramaloom/core";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useMemo, useRef } from "react";
import { useTrackDrag } from "../hooks/useTrackDrag.ts";
import { densityCurve, keyStep, valueAt } from "./vary.ts";

type RangeVariation = Extract<Variation, { kind: "range" }>;
type End = "min" | "max";

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
 * The whole track takes the pointer (mouse, pen or finger): a press moves the nearest
 * end there and dragging carries it on. Each thumb is a focusable slider for the keyboard.
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

  const thumbs = useRef<Record<End, HTMLDivElement | null>>({ min: null, max: null });

  const setEnd = (end: End, v: number, record: boolean) => {
    const next = end === "min" ? { ...vary, min: Math.min(v, vary.max) } : { ...vary, max: Math.max(v, vary.min) };
    if (next.min !== vary.min || next.max !== vary.max) onChange(next, record);
  };

  // The end this drag moves; null while the ends meet and the drag has not yet said which way.
  const dragging = useRef<End | null>(null);
  const valueOf = (f: number) => valueAt(f, spec.min, spec.max, step);
  const drag = useTrackDrag({
    onStart(f) {
      onCheckpoint();
      const v = valueOf(f);
      if (vary.min === vary.max) {
        // Ends together: wait for the direction, so both stay reachable.
        dragging.current = v < vary.min ? "min" : v > vary.max ? "max" : null;
      } else {
        const toMin = Math.abs(v - vary.min);
        const toMax = Math.abs(v - vary.max);
        dragging.current = toMin < toMax || (toMin === toMax && v < vary.min) ? "min" : "max";
      }
      if (dragging.current) {
        thumbs.current[dragging.current]?.focus({ preventScroll: true });
        setEnd(dragging.current, v, false);
      } else {
        thumbs.current.max?.focus({ preventScroll: true });
      }
    },
    onMove(f) {
      const v = valueOf(f);
      if (!dragging.current) {
        if (v === vary.min) return;
        dragging.current = v < vary.min ? "min" : "max";
        thumbs.current[dragging.current]?.focus({ preventScroll: true });
      }
      setEnd(dragging.current, v, false);
    },
    onEnd() {
      dragging.current = null;
    },
  });

  const onKey = (end: End) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = end === "min" ? vary.min : vary.max;
    const next = keyStep(e.key, current, spec.min, spec.max, step);
    if (next === null) return;
    // Handled here: the studio's own arrow shortcuts (seed trail) must not fire as well.
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) onCheckpoint();
    setEnd(end, next, false);
  };

  // When both thumbs meet at the top end, the low one sits above, so it stays reachable.
  const loOnTop = lo > 50;
  const thumb = (end: End) => {
    const v = end === "min" ? vary.min : vary.max;
    const onTop = (end === "min") === loOnTop;
    return (
      <div
        ref={(el) => {
          thumbs.current[end] = el;
        }}
        role="slider"
        tabIndex={0}
        aria-label={t(end === "min" ? "param.lowest" : "param.highest", { label: spec.label })}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={v}
        aria-orientation="horizontal"
        className={`vary-thumb absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${onTop ? "z-20" : "z-10"}`}
        style={{ left: `${pct(v)}%` }}
        onKeyDown={onKey(end)}
      />
    );
  };

  return (
    <div className="flex-1">
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="block h-4 w-full" aria-hidden="true">
        <path d={curve} className="fill-sky-500/25 stroke-sky-400/70" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="slider-track relative cursor-pointer" data-vary-track="" {...drag}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-700" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-500" style={{ left: `${lo}%`, width: `${Math.max(0, hi - lo)}%` }} />
        {resolved !== undefined && (
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white/90"
            style={{ left: `${pct(resolved)}%` }}
            title={t("vary.seedValue")}
          />
        )}
        {thumb("min")}
        {thumb("max")}
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
