import type { ArtDocument } from "@gridloom/core";
import { builtinPresets } from "@gridloom/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget, useDialog } from "../hooks/useDialog.ts";
import type { ThumbJob } from "../render/protocol.ts";
import { useThumbnails } from "../render/useThumbnails.ts";
import type { UserPreset } from "../state/library.ts";
import { deletePreset, libraryFile, listPresets, parseLibraryFile, presetId, requestPersistence, savePreset } from "../state/library.ts";
import { download } from "../render/export.ts";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly onLoad: (doc: ArtDocument, hash: string) => void;
  readonly onClose: () => void;
  readonly notify: (msg: string) => void;
}

interface Entry {
  readonly key: string;
  readonly name: string;
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly userId?: string;
}

const THUMB = 220;

export function Library({ doc, hash, onLoad, onClose, notify }: Props) {
  const [user, setUser] = useState<readonly UserPreset[]>([]);
  const [name, setName] = useState(doc.name);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++seq.current;
    listPresets().then(
      // Ignore out-of-order answers, and keep the same array when nothing is saved
      // so the built-in thumbnails are not rendered twice.
      (ps) => mine === seq.current && setUser((prev) => (prev.length === 0 && ps.length === 0 ? prev : ps)),
      () => setAvailable(false),
    );
  }, []);
  useEffect(refresh, [refresh]);

  const entries = useMemo(
    (): readonly Entry[] => [
      ...builtinPresets.map((p) => ({ key: `b/${p.id}`, name: p.doc.name, doc: p.doc, hash: p.hash })),
      ...user.map((p) => ({ key: `u/${p.id}`, name: p.name, doc: p.doc, hash: p.hash, userId: p.id })),
    ],
    [user],
  );
  const jobs = useMemo((): readonly ThumbJob[] => entries.map((e) => ({ doc: e.doc, hash: e.hash })), [entries]);
  const keys = useMemo(() => entries.map((e) => e.key), [entries]);
  const { urls, error } = useThumbnails(jobs, THUMB, keys);

  const save = async () => {
    if (saving) return; // a double click or Enter must not save twice
    setSaving(true);
    const label = name.trim().slice(0, 100) || doc.name;
    try {
      await savePreset({ id: presetId(), name: label, doc: { ...doc, name: label }, hash, createdAt: Date.now() });
      void requestPersistence();
      notify(`Saved "${label}" to your library`);
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };
  const importFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return notify("That file is too large to be a Gridloom library");
    try {
      const parsed = parseLibraryFile(JSON.parse(await file.text()));
      if (!parsed) return notify("Not a Gridloom library file");
      let saved = 0;
      let stopped: string | null = null;
      for (const p of parsed.presets) {
        try {
          await savePreset(p); // same id overwrites, so importing twice does not duplicate
          saved++;
        } catch (e) {
          stopped = e instanceof Error ? e.message : "Could not save";
          break;
        }
      }
      void requestPersistence();
      const parts = [
        `Imported ${saved} preset${saved === 1 ? "" : "s"}`,
        parsed.skipped ? `skipped ${parsed.skipped} invalid` : "",
        stopped ? `stopped: ${stopped}` : "",
      ].filter(Boolean);
      notify(parts.join(", "));
      refresh();
    } catch {
      notify("Could not read that file");
    }
  };

  const remove = async (e: Entry) => {
    if (!e.userId) return;
    // Two clicks: the first arms the button, the second deletes.
    if (confirming !== e.userId) return setConfirming(e.userId);
    setConfirming(null);
    try {
      await deletePreset(e.userId);
      notify(`Deleted "${e.name}"`);
      refresh();
    } catch {
      notify("Could not delete");
    }
  };

  const dialogRef = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (confirming) setConfirming(null);
      else onClose();
    } else if (!isTypingTarget(e.target) && e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onClose();
    }
  });

  const tile = (e: Entry, i: number) => (
    <div key={e.key} className="group relative">
      <button
        type="button"
        onClick={() => onLoad(e.doc, e.hash)}
        title={`Load ${e.name}`}
        className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-zinc-800 transition hover:ring-2 hover:ring-sky-500"
      >
        {urls[i] ? (
          <img src={urls[i] ?? undefined} alt={e.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-zinc-600">...</span>
        )}
      </button>
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="truncate text-[11px] text-zinc-300">{e.name}</span>
        {e.userId && (
          <button
            type="button"
            onClick={() => remove(e)}
            onBlur={() => setConfirming((c) => (c === e.userId ? null : c))}
            className={`rounded px-1.5 py-0.5 text-[11px] ${
              confirming === e.userId ? "bg-red-800 text-white" : "text-zinc-500 hover:bg-red-900/60 hover:text-red-200"
            }`}
            aria-label={confirming === e.userId ? `Confirm delete ${e.name}` : `Delete ${e.name}`}
          >
            {confirming === e.userId ? "Delete?" : "x"}
          </button>
        )}
      </div>
    </div>
  );

  const builtins = builtinPresets.length;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="absolute inset-0 z-30 flex flex-col gap-4 overflow-auto bg-zinc-950 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Library"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <span className="font-semibold text-white">Library</span>
        <input
          className="w-48 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label="Preset name"
          maxLength={100}
        />
        <button
          type="button"
          className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40"
          onClick={save}
          disabled={!available || saving}
        >
          Save current
        </button>
        <button
          type="button"
          className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700 disabled:opacity-40"
          disabled={user.length === 0}
          onClick={() => download(libraryFile(user), "gridloom-library.json")}
          title="Download all your presets as one file"
        >
          Export all
        </button>
        <label className="cursor-pointer rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" title="Add presets from a library file">
          Import
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            disabled={!available}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-zinc-500" aria-live="polite">
          {error ?? ""}
        </span>
        <div className="flex-1" />
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={onClose}>
          Done (Esc)
        </button>
      </div>
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Built-in</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {entries.slice(0, builtins).map((e, i) => tile(e, i))}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Yours</h2>
        <p className="mb-2 text-[11px] text-amber-200/80">
          Saved in this browser on this site only. Clearing site data, private windows, or Safari&apos;s cleanup of unvisited sites can remove
          them. Use Export all for a backup or to move them to another browser.
        </p>
        {!available ? (
          <p className="text-xs text-zinc-500">This browser does not allow local storage here, so presets cannot be saved. Close the library and use Save in the toolbar to download a file instead.</p>
        ) : user.length === 0 ? (
          <p className="text-xs text-zinc-500">Nothing saved yet.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {entries.slice(builtins).map((e, i) => tile(e, i + builtins))}
          </div>
        )}
      </section>
    </div>
  );
}
