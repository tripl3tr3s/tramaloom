import type { ArtDocument } from "@gridloom/core";
import { useEffect, useMemo, useState } from "react";
import type { ThumbJob } from "../render/protocol.ts";
import { useThumbnails } from "../render/useThumbnails.ts";
import { CloseIcon } from "./icons.tsx";
import { useLang } from "../i18n/i18n.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly favorites: readonly string[];
  readonly onPick: (hash: string) => void;
  readonly onRemove: (hash: string) => void;
}

const THUMB = 160;
const SETTLE_MS = 300;

/** The value once it has stopped changing for `ms`: a slider drag re-renders the strip once, not per tick. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Starred seeds, drawn with the current document: picking one jumps to it, and
 * an edit shows at once how it reads across the seeds worth keeping.
 */
export function FavoritesStrip({ doc, hash, favorites, onPick, onRemove }: Props) {
  const { t } = useLang();
  // Only the layers draw; renaming the piece must not redraw 48 thumbnails.
  const layers = useSettled(doc.layers, SETTLE_MS);
  const jobs = useMemo((): readonly ThumbJob[] => favorites.map((h) => ({ doc: { version: 1, name: "", layers }, hash: h })), [layers, favorites]);
  const { urls } = useThumbnails(jobs, THUMB, favorites);
  return (
    <section aria-label={t("fav.region")} className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/80 px-3 py-2">
      <div className="shrink-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t("fav.title")} <span className="font-normal text-zinc-600">{favorites.length}</span>
        </h2>
        <p className="mt-0.5 hidden max-w-36 text-[10px] leading-snug text-zinc-600 md:block">{t("fav.note")}</p>
      </div>
      <ol className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 pr-1.5 pt-1.5">
        {favorites.map((h, i) => (
          <li key={h} className="group relative shrink-0">
            <button
              type="button"
              className={`grid h-16 w-16 place-items-center overflow-hidden rounded bg-zinc-950 ring-1 hover:ring-2 hover:ring-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${h === hash ? "ring-2 ring-sky-400" : "ring-zinc-700"}`}
              onClick={() => onPick(h)}
              aria-label={t("fav.go", { seed: h.slice(0, 8) })}
              aria-current={h === hash ? "true" : undefined}
              title={h}
            >
              {urls[i] ? <img src={urls[i] ?? undefined} alt="" className="max-h-full max-w-full object-contain" /> : <span className="size-3 animate-pulse rounded-full bg-zinc-800" />}
            </button>
            <button
              type="button"
              className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-zinc-800 text-zinc-400 opacity-0 ring-1 ring-zinc-700 hover:bg-red-950 hover:text-red-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-sky-500 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => onRemove(h)}
              aria-label={t("fav.removeNamed", { seed: h.slice(0, 8) })}
              title={t("fav.remove")}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
