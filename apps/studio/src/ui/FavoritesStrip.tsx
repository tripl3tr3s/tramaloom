import type { ArtDocument } from "@gridloom/core";
import { useMemo } from "react";
import type { ThumbJob } from "../render/protocol.ts";
import { useThumbnails } from "../render/useThumbnails.ts";
import { CloseIcon } from "./icons.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly favorites: readonly string[];
  readonly onPick: (hash: string) => void;
  readonly onRemove: (hash: string) => void;
}

const THUMB = 160;

/**
 * Starred seeds, drawn with the current document: picking one jumps to it, and
 * an edit shows at once how it reads across the seeds worth keeping.
 */
export function FavoritesStrip({ doc, hash, favorites, onPick, onRemove }: Props) {
  const jobs = useMemo((): readonly ThumbJob[] => favorites.map((h) => ({ doc, hash: h })), [doc, favorites]);
  const { urls } = useThumbnails(jobs, THUMB, favorites);
  return (
    <section aria-label="Favourite seeds" className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/80 px-3 py-2">
      <div className="shrink-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Favourites <span className="font-normal text-zinc-600">{favorites.length}</span>
        </h2>
        <p className="mt-0.5 max-w-36 text-[10px] leading-snug text-zinc-600">Seeds only, drawn with the current settings. Keep a finished piece in the Library.</p>
      </div>
      <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5">
        {favorites.map((h, i) => (
          <li key={h} className="group relative shrink-0">
            <button
              type="button"
              className={`grid h-16 w-16 place-items-center overflow-hidden rounded bg-zinc-950 ring-1 hover:ring-2 hover:ring-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${h === hash ? "ring-2 ring-sky-400" : "ring-zinc-700"}`}
              onClick={() => onPick(h)}
              aria-label={`Go to seed ${h.slice(0, 8)}`}
              aria-current={h === hash ? "true" : undefined}
              title={h}
            >
              {urls[i] ? <img src={urls[i] ?? undefined} alt="" className="max-h-full max-w-full object-contain" /> : <span className="size-3 animate-pulse rounded-full bg-zinc-800" />}
            </button>
            <button
              type="button"
              className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-zinc-800 text-zinc-400 opacity-0 ring-1 ring-zinc-700 hover:bg-red-950 hover:text-red-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-sky-500 group-hover:opacity-100"
              onClick={() => onRemove(h)}
              aria-label={`Remove seed ${h.slice(0, 8)} from favourites`}
              title="Remove from favourites"
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
