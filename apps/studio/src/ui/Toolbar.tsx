import { normaliseHash } from "@gridloom/core";
import { useEffect, useState } from "react";
import { ChevronIcon, StarIcon } from "./icons.tsx";
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
}

const btn =
  "rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent";
const sep = <span className="mx-1 h-4 w-px bg-zinc-700" />;

export function Toolbar(p: Props) {
  const [draft, setDraft] = useState(p.hash);
  useEffect(() => setDraft(p.hash), [p.hash]);
  const commitHash = () => {
    try {
      p.onHash(normaliseHash(draft));
    } catch {
      setDraft(p.hash);
    }
  };

  return (
    <header className="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
      <span className="mr-2 text-sm font-semibold tracking-tight text-white">Gridloom</span>
      <input
        className="w-36 rounded bg-transparent px-1.5 py-0.5 text-xs text-zinc-300 outline-none hover:bg-zinc-800 focus:bg-zinc-800"
        value={p.name}
        onChange={(e) => p.onRename(e.target.value)}
        aria-label="Piece name"
      />
      {p.unsaved && (
        <span className="-ml-1 grid size-4 place-items-center" title="Unsaved changes: Save document, add it to the Library, or copy a share link to keep them">
          <span className="size-1.5 rounded-full bg-amber-400" aria-hidden="true" />
          <span className="sr-only">Unsaved changes</span>
        </span>
      )}
      {sep}
      <button type="button" className={btn} onClick={p.onPrev} disabled={!p.canPrev} title="Previous seed (Left)">
        ←
      </button>
      <button type="button" className={btn} onClick={p.onReroll} title="New random seed (R)">
        Reroll
      </button>
      <button type="button" className={btn} onClick={p.onNext} title="Next seed (Right)">
        →
      </button>
      <input
        className="w-44 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 outline-none focus:text-zinc-100 focus:ring-1 focus:ring-sky-500 lg:w-72"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitHash}
        onKeyDown={(e) => e.key === "Enter" && commitHash()}
        spellCheck={false}
        aria-label="Hash"
      />
      <button
        type="button"
        className={`${btn} ${p.favorite ? "text-amber-300 hover:text-amber-200" : ""}`}
        onClick={p.onFavorite}
        aria-pressed={p.favorite}
        aria-label="Favourite this seed"
        title={p.favorite ? "Remove this seed from favourites (B)" : "Add this seed to favourites (B)"}
      >
        <StarIcon filled={p.favorite} />
      </button>
      {sep}
      <button type="button" className={btn} onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" className={btn} onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      {sep}
      <button type="button" className={btn} onClick={p.onMutate} title="Mutation grid (M)">
        Mutate
      </button>
      <button type="button" className={btn} onClick={p.onLibrary} title="Preset library (L)">
        Library
      </button>
      <button type="button" className={btn} onClick={p.onEdition} title="Traits, census, contact sheet, batch export (E)">
        Edition
      </button>
      <div className="flex-1" />
      <label className={`${btn} cursor-pointer has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-sky-500`} title="Open a .gridloom.json document">
        Open
        <input
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
        label="Export"
        title="Export images, save the document, copy a share link"
        align="right"
        triggerClass={`${btn} inline-flex items-center gap-1 bg-sky-700/80 text-white hover:bg-sky-600`}
        trigger={
          <>
            Export <ChevronIcon />
          </>
        }
        items={[
          { label: "PNG, 2000 px", hint: "S", onSelect: () => p.onExportPNG(2000) },
          { label: "PNG, 4000 px", hint: "Shift+S", onSelect: () => p.onExportPNG(4000) },
          { label: "SVG", description: "Vector, from the same drawing", onSelect: p.onExportSVG },
          { label: "Save document", description: "JSON file you can Open later", separatorBefore: true, onSelect: p.onExportJSON },
          { label: "Copy share link", description: "Settings and seed, no server", onSelect: p.onCopyLink },
        ]}
      />
      {sep}
      <button type="button" className={btn} onClick={p.onToggleDebug} title="Debug panel (G)">
        Debug
      </button>
      <button type="button" className={btn} onClick={p.onShortcuts} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        ?
      </button>
    </header>
  );
}
