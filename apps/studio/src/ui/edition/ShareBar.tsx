export const pct = (v: number): string => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`;

/**
 * One share as a thin bar, with an optional target drawn as a neutral tick.
 * Numbers are always printed beside it, so nothing depends on colour alone.
 */
export function ShareBar({ share, target, title }: { readonly share: number; readonly target?: number; readonly title?: string }) {
  const w = (v: number) => `${Math.min(100, Math.max(0, v * 100))}%`;
  return (
    <div className="relative h-2.5 flex-1 rounded-sm bg-zinc-800/70" title={title} role="presentation">
      <div className="absolute inset-y-0 left-0 rounded-r-[3px] bg-sky-500" style={{ width: w(share) }} />
      {target !== undefined && (
        <div className="absolute -inset-y-0.5 w-0.5 rounded bg-zinc-100 ring-2 ring-zinc-950" style={{ left: `calc(${w(target)} - 1px)` }} />
      )}
    </div>
  );
}
