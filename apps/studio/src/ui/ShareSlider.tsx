import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";
import { useTrackDrag } from "../hooks/useTrackDrag.ts";
import { weightsForShare } from "./params.ts";
import { keyStep, valueAt } from "./vary.ts";

type Weights = Readonly<Record<string, number>>;

interface Props {
  readonly options: readonly string[];
  readonly option: string;
  readonly weights: Weights;
  /** This option's chance, 0 to 1. */
  readonly share: number;
  /** The option this seed drew: its bar is brighter. */
  readonly drawn: boolean;
  readonly label: string;
  readonly onChange: (weights: Weights, record: boolean) => void;
  readonly onCheckpoint: () => void;
}

/**
 * One option's chance as a bar you can drag (mouse, pen or finger): drag to 30% and
 * this option gets 30% of seeds, the others share the rest in their old proportions.
 */
export function ShareSlider({ options, option, weights, share, drawn, label, onChange, onCheckpoint }: Props) {
  // Each drag starts from the weights it found, so rounding never piles up along the way.
  const base = useRef<Weights>(weights);
  const set = (pct: number, from: Weights, record: boolean) => onChange(weightsForShare(options, from, option, pct / 100), record);
  const pctAt = (f: number) => valueAt(f, 0, 100, 1);
  const drag = useTrackDrag({
    onStart(f) {
      onCheckpoint();
      base.current = weights;
      set(pctAt(f), base.current, false);
    },
    onMove(f) {
      set(pctAt(f), base.current, false);
    },
  });

  const pct = Math.round(share * 100);
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = keyStep(e.key, pct, 0, 100, 1);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) onCheckpoint();
    if (next !== pct) set(next, weights, false);
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      className="slider-track relative flex-1 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
      data-share-slider={option}
      onKeyDown={onKey}
      {...drag}
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-800">
        <span className={`absolute inset-y-0 left-0 rounded-full ${drawn ? "bg-sky-400" : "bg-sky-700"}`} style={{ width: `${share * 100}%` }} />
      </span>
      <span className="share-thumb absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${share * 100}%` }} />
    </div>
  );
}
