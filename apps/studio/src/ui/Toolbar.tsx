import { normaliseHash } from "@gridloom/core";
import { useEffect, useRef, useState } from "react";
import { ChevronIcon, StarIcon } from "./icons.tsx";
import { useLang } from "../i18n/i18n.tsx";
import { Menu } from "./Menu.tsx";

interface Props {
  readonly name: string;
  /** The doc differs from the last save, open or shared link. */
  readonly unsaved: boolean;
  /** The current seed is starred. */
  readonly favorite: boolean;
  readonly onFavorite: () => void;
  readonly hash: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canPrev: boolean;
  readonly onRename: (name: string) => void;
  readonly onHash: (hash: string) => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onReroll: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onExportPNG: (longSide: number) => void;
  readonly onExportSVG: () => void;
  readonly onExportJSON: () => void;
  readonly onImport: (file: File) => void;
  readonly onCopyLink: () => void;
  readonly onToggleDebug: () => void;
  readonly onShortcuts: () => void;
  readonly onMutate: () => void;
  readonly onLibrary: () => void;
  readonly onEdition: () => void;
  readonly onLearn: () => void;
}

const btn =
  "rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent pointer-coarse:py-1.5";
const sep = <span className="mx-1 h-4 w-px bg-zinc-700 max-md:hidden" />;
/** Desktop only: on phones these live in the More menu. */
const wide = "max-md:hidden";
/** Phones: seed controls go to a second row (same order value keeps their source order). */
const row2 = "max-md:order-last";

export function Toolbar(p: Props) {
  const { lang, setLang, t } = useLang();
  const [draft, setDraft] = useState(p.hash);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => setDraft(p.hash), [p.hash]);
  const commitHash = () => {
    try {
      p.onHash(normaliseHash(draft));
    } catch {
      setDraft(p.hash);
    }
  };

  return (
    <header className="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 max-md:gap-y-1.5 max-md:px-2">
      <span className="mr-2 text-sm font-semibold tracking-tight text-white max-xl:hidden">Gridloom</span>
      <input
        className="w-24 lg:w-28 xl:w-32 rounded bg-transparent max-md:min-w-0 max-md:flex-1 px-1.5 py-0.5 text-xs text-zinc-300 outline-none hover:bg-zinc-800 focus:bg-zinc-800"
        value={p.name}
        onChange={(e) => p.onRename(e.target.value)}
        aria-label={t("toolbar.pieceName")}
      />
      {p.unsaved && (
        <span className="-ml-1 grid size-4 place-items-center" title={t("toolbar.unsavedHint")}>
          <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="sr-only">{t("toolbar.unsaved")}</span>
        </span>
      )}
      {sep}
      {/* Phones: forces the seed controls onto their own row. */}
      <span className={`hidden basis-full max-md:block ${row2}`} aria-hidden="true" />
      <button type="button" className={`${btn} ${row2}`} onClick={p.onPrev} disabled={!p.canPrev} title={t("toolbar.prevSeed")} aria-label={t("toolbar.prevSeed")}>
        ←
      </button>
      <button type="button" className={`${btn} ${row2}`} onClick={p.onReroll} title={t("toolbar.rerollHint")}>
        {t("toolbar.reroll")}
      </button>
      <button type="button" className={`${btn} ${row2}`} onClick={p.onNext} title={t("toolbar.nextSeed")} aria-label={t("toolbar.nextSeed")}>
        →
      </button>
      <input
        className="w-32 lg:w-36 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 outline-none focus:text-zinc-100 focus:ring-1 focus:ring-sky-500 xl:w-56 max-md:order-last max-md:min-w-0 max-md:flex-1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitHash}
        onKeyDown={(e) => e.key === "Enter" && commitHash()}
        spellCheck={false}
        aria-label={t("toolbar.hash")}
      />
      <button
        type="button"
        className={`${btn} ${row2} ${p.favorite ? "text-amber-300 hover:text-amber-200" : ""}`}
        onClick={p.onFavorite}
        aria-pressed={p.favorite}
        aria-label={t("toolbar.favourite")}
        title={p.favorite ? t("toolbar.unfavouriteHint") : t("toolbar.favouriteHint")}
      >
        <StarIcon filled={p.favorite} />
      </button>
      {sep}
      <button type="button" className={btn} onClick={p.onUndo} disabled={!p.canUndo} title={t("toolbar.undoHint")} aria-label={t("toolbar.undo")}>
        <span aria-hidden="true" className="text-sm leading-none">↶</span>
      </button>
      <button type="button" className={btn} onClick={p.onRedo} disabled={!p.canRedo} title={t("toolbar.redoHint")} aria-label={t("toolbar.redo")}>
        <span aria-hidden="true" className="text-sm leading-none">↷</span>
      </button>
      {sep}
      <button type="button" className={`${btn} ${wide}`} onClick={p.onMutate} title={t("toolbar.mutateHint")}>
        {t("toolbar.mutate")}
      </button>
      <button type="button" className={`${btn} ${wide}`} onClick={p.onLibrary} title={t("toolbar.libraryHint")}>
        {t("toolbar.library")}
      </button>
      <button type="button" className={`${btn} ${wide}`} onClick={p.onLearn} title={t("toolbar.learnHint")}>
        {t("toolbar.learn")}
      </button>
      {/* Advanced: set apart and muted. Nothing in it is needed to make or export a picture. */}
      <span className={`mx-1 h-4 w-px bg-zinc-800 ${wide}`} />
      <button type="button" className={`${btn} ${wide} text-zinc-500`} onClick={p.onEdition} title={t("toolbar.editionHint")}>
        {t("toolbar.edition")}
      </button>
      <div className="flex-1 max-md:hidden" />
      <label className={`${btn} ${wide} cursor-pointer has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-sky-500`} title={t("toolbar.openHint")}>
        {t("toolbar.open")}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = "";
          }}
        />
      </label>
      <Menu
        label={t("toolbar.export")}
        title={t("toolbar.exportHint")}
        align="right"
        triggerClass={`${btn} inline-flex items-center gap-1 bg-sky-700/80 text-white hover:bg-sky-600`}
        trigger={
          <>
            {t("toolbar.export")} <ChevronIcon />
          </>
        }
        items={[
          { label: "PNG, 2000 px", hint: "S", onSelect: () => p.onExportPNG(2000) },
          { label: "PNG, 4000 px", hint: "Shift+S", onSelect: () => p.onExportPNG(4000) },
          { label: "SVG", description: t("toolbar.svgDesc"), onSelect: p.onExportSVG },
          { label: t("toolbar.saveDoc"), description: t("toolbar.saveDocDesc"), separatorBefore: true, onSelect: p.onExportJSON },
          { label: t("toolbar.copyLink"), description: t("toolbar.copyLinkDesc"), onSelect: p.onCopyLink },
        ]}
      />
      <div className="md:hidden">
        <Menu
          label={t("toolbar.more")}
          align="right"
          triggerClass={`${btn} inline-flex items-center gap-1`}
          trigger={
            <>
              {t("toolbar.more")} <ChevronIcon />
            </>
          }
          items={[
            { label: t("toolbar.learn"), description: t("toolbar.learnDesc"), onSelect: p.onLearn },
            { label: t("toolbar.mutate"), description: t("toolbar.mutateDesc"), onSelect: p.onMutate },
            { label: t("toolbar.library"), description: t("toolbar.libraryDesc"), onSelect: p.onLibrary },
            { label: t("toolbar.edition"), description: t("toolbar.editionDesc"), onSelect: p.onEdition },
            { label: t("toolbar.openDoc"), description: t("toolbar.openDocDesc"), separatorBefore: true, onSelect: () => fileRef.current?.click() },
            { label: t("lang.switchTo"), separatorBefore: true, onSelect: () => setLang(lang === "es" ? "en" : "es") },
            { label: t("toolbar.debugPanel"), separatorBefore: true, onSelect: p.onToggleDebug },
            { label: t("toolbar.shortcuts"), onSelect: p.onShortcuts },
          ]}
        />
      </div>
      {sep}
      {/* A developer tool: G opens it at any width; the button only where there is room. */}
      <button type="button" className={`${btn} ${wide} max-xl:hidden`} onClick={p.onToggleDebug} title={t("toolbar.debugHint")}>
        {t("toolbar.debug")}
      </button>
      <button type="button" className={`${btn} ${wide}`} onClick={p.onShortcuts} aria-label={t("toolbar.shortcuts")} title={t("toolbar.shortcutsHint")}>
        ?
      </button>
    </header>
  );
}
