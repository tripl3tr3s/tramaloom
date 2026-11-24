import type { ArtDocument } from "@tramaloom/core";
import { builtinPresets } from "@tramaloom/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget, useDialog } from "../hooks/useDialog.ts";
import type { ThumbJob } from "../render/protocol.ts";
import { useThumbnails } from "../render/useThumbnails.ts";
import type { UserPreset } from "../state/library.ts";
import { deletePreset, libraryFile, listPresets, parseLibraryFile, presetId, requestPersistence, savePreset } from "../state/library.ts";
import { download } from "../render/export.ts";
import { useLang } from "../i18n/i18n.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly onLoad: (doc: ArtDocument, hash: string) => void;
  /** The current doc was stored as a preset. */
  readonly onSaved: () => void;
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

export function Library({ doc, hash, onLoad, onSaved, onClose, notify }: Props) {
  const { t } = useLang();
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
      onSaved();
      void requestPersistence();
      notify(t("library.saved", { name: label }));
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t("library.saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  const importFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) return notify(t("library.tooLarge"));
    try {
      const parsed = parseLibraryFile(JSON.parse(await file.text()));
      if (!parsed) return notify(t("library.notLibrary"));
      let saved = 0;
      let stopped: string | null = null;
      for (const p of parsed.presets) {
        try {
          await savePreset(p); // same id overwrites, so importing twice does not duplicate
          saved++;
        } catch (e) {
          stopped = e instanceof Error ? e.message : t("library.saveFailed");
          break;
        }
      }
      void requestPersistence();
      const parts = [
        saved === 1 ? t("library.importedOne") : t("library.importedMany", { n: saved }),
        parsed.skipped ? t("library.skipped", { n: parsed.skipped }) : "",
        stopped ? t("library.stopped", { error: stopped }) : "",
      ].filter(Boolean);
      notify(parts.join(", "));
      refresh();
    } catch {
      notify(t("app.unreadable"));
    }
  };

  const remove = async (e: Entry) => {
    if (!e.userId) return;
    // Two clicks: the first arms the button, the second deletes.
    if (confirming !== e.userId) return setConfirming(e.userId);
    setConfirming(null);
    try {
      await deletePreset(e.userId);
      notify(t("library.deleted", { name: e.name }));
      refresh();
    } catch {
      notify(t("library.deleteFailed"));
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
        title={t("library.load", { name: e.name })}
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
            aria-label={confirming === e.userId ? t("library.confirmDelete", { name: e.name }) : t("library.delete", { name: e.name })}
          >
            {confirming === e.userId ? t("library.deleteAsk") : "x"}
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
      aria-label={t("toolbar.library")}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <span className="font-semibold text-white">{t("toolbar.library")}</span>
        <input
          className="w-48 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label={t("library.presetName")}
          maxLength={100}
        />
        <button
          type="button"
          className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600 disabled:opacity-40"
          onClick={save}
          disabled={!available || saving}
        >
          {t("library.saveCurrent")}
        </button>
        <button
          type="button"
          className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700 disabled:opacity-40"
          disabled={user.length === 0}
          onClick={() => download(libraryFile(user), "tramaloom-library.json")}
          title={t("library.exportAllHint")}
        >
          {t("library.exportAll")}
        </button>
        <label className="cursor-pointer rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" title={t("library.importHint")}>
          {t("library.import")}
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
          {t("common.doneEsc")}
        </button>
      </div>
      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">{t("library.builtIn")}</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {entries.slice(0, builtins).map((e, i) => tile(e, i))}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{t("library.yours")}</h2>
        <p className="mb-2 text-[11px] text-amber-200/80">
          {t("library.storageNote")}
        </p>
        {!available ? (
          <p className="text-xs text-zinc-500">{t("library.noStorage")}</p>
        ) : user.length === 0 ? (
          <p className="text-xs text-zinc-500">{t("library.empty")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {entries.slice(builtins).map((e, i) => tile(e, i + builtins))}
          </div>
        )}
      </section>
    </div>
  );
}
