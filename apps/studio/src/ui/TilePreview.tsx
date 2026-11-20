import type { RefObject } from "react";
import { useEffect, useRef } from "react";

interface Props {
  /** The studio's main canvas; read back, never drawn into. */
  readonly source: RefObject<HTMLCanvasElement | null>;
  /** Changes whenever the main canvas has a new render. */
  readonly version: unknown;
  readonly box: { readonly width: number; readonly height: number };
  /** Margin or corner radius would show as seams; say so instead of leaving people guessing. */
  readonly seamHint: string | null;
}

const REPEAT = 3;

/** The current render repeated 3x3, to check that a pattern's edges join. */
export function TilePreview({ source, version, box, seamHint }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const src = source.current;
    const dst = ref.current;
    if (!src || !dst || src.width === 0 || src.height === 0) return;
    // Fit 3x3 copies of the art inside the viewport, at device resolution.
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(box.width / (src.width * REPEAT), box.height / (src.height * REPEAT)) * dpr;
    const tw = Math.max(1, Math.floor(src.width * scale));
    const th = Math.max(1, Math.floor(src.height * scale));
    dst.width = tw * REPEAT;
    dst.height = th * REPEAT;
    dst.style.width = `${(tw * REPEAT) / dpr}px`;
    dst.style.height = `${(th * REPEAT) / dpr}px`;
    const ctx = dst.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    for (let j = 0; j < REPEAT; j++) for (let i = 0; i < REPEAT; i++) ctx.drawImage(src, i * tw, j * th, tw, th);
  }, [source, version, box]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950">
      <canvas ref={ref} role="img" aria-label="The piece repeated three by three" className="shadow-2xl shadow-black/60" />
      {seamHint && <p className="rounded bg-zinc-900/90 px-2 py-1 text-[11px] text-zinc-400">{seamHint}</p>}
    </div>
  );
}
