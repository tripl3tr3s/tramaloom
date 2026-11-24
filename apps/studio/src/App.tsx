import type { ArtDocument, LayerScript, ParamSetting } from "@tramaloom/core";
import { defaultRegistry, ENGINE_VERSION, layerDef, SCRIPT_API, SCRIPT_MODULE, starterDocument } from "@tramaloom/core";
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useShortcuts } from "./hooks/useShortcuts.ts";
import { useUrlSync } from "./hooks/useUrlSync.ts";
import { exportJSON, exportPNG, exportSVG } from "./render/export.ts";
import { useRenderer } from "./render/useRenderer.ts";
import { loadFavorites, MAX_FAVORITES, saveFavorites, toggleFavorite } from "./state/favorites.ts";
import { needsGrid, promoteIndex } from "./state/layerOrder.ts";
import { parseDocument } from "./state/schema.ts";
import { encodeState } from "./state/url.ts";
import { freshId, initialState, randomHash, reducer } from "./state/store.ts";
import { DebugPanel } from "./ui/DebugPanel.tsx";
import { LayerStack } from "./ui/LayerStack.tsx";
import { FavoritesStrip } from "./ui/FavoritesStrip.tsx";
import { ParamPanel } from "./ui/ParamPanel.tsx";
import { ScrollHints } from "./ui/ScrollHints.tsx";
import { TilePreview } from "./ui/TilePreview.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { isFirstVisit, Welcome } from "./ui/Welcome.tsx";
import { REMIXABLE } from "./ui/code/remixLayer.ts";
import type { Lesson } from "./lessons/lessons.ts";
import { useLang } from "./i18n/i18n.tsx";
import { compileInSandbox } from "./sandbox/host.ts";
import { parseScriptParams } from "./state/schema.ts";
import { MAX_LAYERS } from "./state/limits.ts";
import { approveScripts, unapprovedScripts, useTrustVersion } from "./sandbox/trust.ts";
import { errorText } from "./i18n/errors.ts";

// Overlays load on demand, so the first paint does not wait for them. The Edition panel is the
// heaviest: its Mint tab carries the whole player. All are fetched once the page is idle.
const loadMutation = () => import("./ui/MutationGrid.tsx");
const loadEdition = () => import("./ui/edition/EditionPanel.tsx");
const loadLibrary = () => import("./ui/Library.tsx");
const loadShortcuts = () => import("./ui/ShortcutsHelp.tsx");
const loadCode = () => import("./ui/code/CodeView.tsx");
const loadScriptEditor = () => import("./ui/code/ScriptEditor.tsx");
const loadLessons = () => import("./ui/lessons/LessonPicker.tsx");
const loadLessonPanel = () => import("./ui/lessons/LessonPanel.tsx");
const loadScriptStart = () => import("./ui/code/ScriptStart.tsx");
const MutationGrid = lazy(() => loadMutation().then((m) => ({ default: m.MutationGrid })));
const EditionPanel = lazy(() => loadEdition().then((m) => ({ default: m.EditionPanel })));
const Library = lazy(() => loadLibrary().then((m) => ({ default: m.Library })));
const ShortcutsHelp = lazy(() => loadShortcuts().then((m) => ({ default: m.ShortcutsHelp })));
const CodeView = lazy(() => loadCode().then((m) => ({ default: m.CodeView })));
const ScriptEditor = lazy(() => loadScriptEditor().then((m) => ({ default: m.ScriptEditor })));
const LessonPicker = lazy(() => loadLessons().then((m) => ({ default: m.LessonPicker })));
const LessonPanel = lazy(() => loadLessonPanel().then((m) => ({ default: m.LessonPanel })));
const ScriptStart = lazy(() => loadScriptStart().then((m) => ({ default: m.ScriptStart })));
const preloadOverlays = () => {
  for (const load of [loadLibrary, loadMutation, loadEdition, loadShortcuts, loadCode, loadScriptEditor, loadLessons, loadLessonPanel, loadScriptStart]) load().catch(() => undefined);
};

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(starterDocument, randomHash()));
  const [debug, setDebug] = useState(false);
  const [overlay, setOverlay] = useState<"none" | "mutate" | "library" | "edition" | "shortcuts" | "welcome" | "code" | "lessons" | "scriptStart">(() => (isFirstVisit() ? "welcome" : "none"));
  const [toast, setToast] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<readonly string[]>(loadFavorites);
  // Phones: which panel is open as a bottom sheet (null shows the art alone). Ignored from md up.
  const [sheet, setSheet] = useState<"layers" | "params" | null>(null);
  const [tiled, setTiled] = useState(false);
  // The module whose source the Code overlay shows.
  const [codeOf, setCodeOf] = useState<{ readonly id: string; readonly label: string; readonly layerId: string } | null>(null);
  // The script layer whose code is open in the editor under the canvas.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Code written or remixed here is the person's own: it runs without asking.
  const applyScript = useCallback((layerId: string, script: LayerScript) => {
    approveScripts([script.code]);
    dispatch({ type: "setScript", layerId, script });
  }, []);
  // Lessons: the chosen language, and the lesson in progress with the layer it follows.
  const { lang, t } = useLang();
  const [lesson, setLesson] = useState<{ readonly lesson: Lesson; readonly step: number; readonly layerId: string } | null>(null);
  const [lessonBusy, setLessonBusy] = useState(false);
  const docRef = useRef(state.doc);
  docRef.current = state.doc;

  /** A lesson's code as a script: it is ours, so approved; compiled in the sandbox for its params. */
  const scriptFrom = async (code: string): Promise<LayerScript> => {
    approveScripts([code]);
    const compiled = await compileInSandbox(code);
    const params = parseScriptParams(compiled.params);
    if (!params.ok) throw new Error(params.error);
    return { api: SCRIPT_API, label: compiled.label, code, params: params.params };
  };
  const startLesson = async (chosen: Lesson) => {
    setOverlay("none");
    if (docRef.current.layers.length >= MAX_LAYERS) return notify(t("app.lessonFull", { max: MAX_LAYERS }));
    try {
      const script = await scriptFrom(chosen.start(lang));
      const id = freshId(docRef.current, "lesson");
      dispatch({ type: "addLayer", module: SCRIPT_MODULE, id, script });
      setLesson({ lesson: chosen, step: 0, layerId: id });
      setEditingId(id);
    } catch (err) {
      notify(t("app.lessonFailed", { error: errorText(err, t) }), 4000);
    }
  };
  /** A new script layer from code the person chose (an example, blank, or a built-in layer's): theirs, so approved. */
  const addScript = (script: LayerScript) => {
    setOverlay("none");
    if (docRef.current.layers.length >= MAX_LAYERS) return notify(t("layers.full", { max: MAX_LAYERS }));
    approveScripts([script.code]);
    const id = freshId(docRef.current, "script");
    dispatch({ type: "addLayer", module: SCRIPT_MODULE, id, script });
    setEditingId(id);
  };
  const showMe = async (layerId: string, code: string) => {
    setLessonBusy(true);
    try {
      applyScript(layerId, await scriptFrom(code));
    } catch (err) {
      notify(t("app.stepFailed", { error: errorText(err, t) }), 4000);
    } finally {
      setLessonBusy(false);
    }
  };

  // Code that arrived from elsewhere (a link, a file, an import) waits for a yes.
  useTrustVersion();
  const untrusted = unapprovedScripts(state.doc);
  const untrustedKey = untrusted.join("\u0000");
  const [keptHidden, setKeptHidden] = useState("");
  const firstUntrusted = state.doc.layers.find((l) => l.enabled && l.script && untrusted.includes(l.script.code));
  const notRunning = useMemo(
    () => new Set(state.doc.layers.flatMap((l) => (l.enabled && l.script && untrusted.includes(l.script.code) ? [l.id] : []))),
    // untrustedKey stands for the untrusted list.
    [state.doc.layers, untrustedKey],
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string, ms = 1600) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const ready = useUrlSync(state.doc, state.hash, (doc, hash, engine) => {
    dispatch({ type: "hydrate", doc, hash });
    if (doc && engine !== ENGINE_VERSION) {
      notify(t("app.oldEngine", { then: engine, now: ENGINE_VERSION }), 6000);
    }
  });

  useEffect(() => {
    // After the first picture: warm the overlay chunks so opening one never waits on the network.
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(preloadOverlays, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(preloadOverlays, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const pad = 48;
      setBox({ width: Math.max(1, entry.contentRect.width - pad), height: Math.max(1, entry.contentRect.height - pad) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const info = useRenderer(canvasRef, state.doc, state.hash, ready ? box : { width: 0, height: 0 });

  const png = useCallback(
    (size: number) => {
      notify(t("app.renderingPng", { size }));
      exportPNG(state.doc, state.hash, size).catch((e: unknown) => notify(t("app.exportFailed", { error: errorText(e, t) })));
    },
    [state.doc, state.hash, notify],
  );
  const copy = (text: string, msg: string, onDone?: () => void) =>
    navigator.clipboard.writeText(text).then(
      () => {
        notify(msg);
        onDone?.();
      },
      () => notify(t("app.noClipboard")),
    );
  const importFile = async (file: File) => {
    // Documents are small; a script layer adds at most 20,000 characters.
    if (file.size > 2_000_000) return notify(t("app.fileTooLarge"));
    try {
      const doc = parseDocument(JSON.parse(await file.text()));
      if (!doc) return notify(t("app.notADoc"));
      dispatch({ type: "loadDoc", doc });
      notify(t("app.opened", { name: doc.name }));
    } catch {
      notify(t("app.unreadable"));
    }
  };

  const toggleFav = (h: string) => {
    const next = toggleFavorite(favorites, h);
    if (!favorites.includes(h) && favorites.length >= MAX_FAVORITES) {
      notify(t("app.favouritesFull", { max: MAX_FAVORITES }), 3000);
    }
    setFavorites(next);
    saveFavorites(next);
  };

  // Overlays handle their own keys; the studio's shortcuts pause while one is open.
  useShortcuts(overlay !== "none" ? {} : {
    m: () => setOverlay("mutate"),
    l: () => setOverlay("library"),
    e: () => setOverlay("edition"),
    // "?" is Shift+/ on most layouts, so it arrives shifted; accept both.
    "?": () => setOverlay("shortcuts"),
    "shift+?": () => setOverlay("shortcuts"),
    r: () => dispatch({ type: "setHash", hash: randomHash() }),
    ArrowLeft: () => dispatch({ type: "seedPrev" }),
    ArrowRight: () => dispatch({ type: "seedNext" }),
    c: () => copy(state.hash, t("app.hashCopied")),
    b: () => toggleFav(state.hash),
    s: () => png(2000),
    "shift+s": () => png(4000),
    g: () => setDebug((d) => !d),
    t: () => setTiled((x) => !x),
    f: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else viewportRef.current?.requestFullscreen();
    },
    "mod+z": () => dispatch({ type: "undo" }),
    "mod+shift+z": () => dispatch({ type: "redo" }),
    "mod+y": () => dispatch({ type: "redo" }),
  });

  const adopt = (doc: ArtDocument, hash: string) => dispatch({ type: "adopt", doc, hash });

  // While a dialog is open, everything behind it is inert: no stray clicks or tab stops.
  const behind = overlay !== "none";
  const editingLayer = state.doc.layers.find((l) => l.id === editingId && l.module === "script" && l.script);

  // Reference first (cheap, and what undo restores); content second, so typing a name back or
  // dragging a slider back to where it was also reads as saved.
  const unsaved = useMemo(
    () => state.doc !== state.savedDoc && JSON.stringify(state.doc) !== JSON.stringify(state.savedDoc),
    [state.doc, state.savedDoc],
  );

  // A drawing layer with no grid above it renders nothing: say why, and offer the fix that applies.
  const problem = (() => {
    const i = state.doc.layers.findIndex((l) => l.id === state.selectedId);
    if (i < 0 || !needsGrid(state.doc.layers, i)) return null;
    const grids = state.doc.layers.filter((l) => l.module === "grid");
    const hidden = grids.find((g) => !g.enabled);
    const stranded = grids.find((g) => g.enabled && promoteIndex(state.doc.layers, g.id) !== null);
    if (stranded) {
      return {
        message: t("app.gridAfter"),
        fix: t("app.gridAfterFix"),
        onFix: () => dispatch({ type: "promoteLayer", layerId: stranded.id }),
      };
    }
    if (hidden) {
      return {
        message: t("app.gridHidden"),
        fix: t("app.gridHiddenFix"),
        onFix: () => dispatch({ type: "toggleLayer", layerId: hidden.id }),
      };
    }
    return {
      message: t("app.noGrid"),
      fix: t("app.noGridFix"),
      onFix: () => dispatch({ type: "addLayer", module: "grid" }),
    };
  })();

  const selected = state.doc.layers.find((l) => l.id === state.selectedId);
  const onParam = (layerId: string, name: string, setting: ParamSetting, record: boolean) =>
    dispatch({ type: "setParam", layerId, name, setting, record });

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-200">
      <div className="contents" inert={behind}>
      <Toolbar
        name={state.doc.name}
        unsaved={unsaved}
        favorite={favorites.includes(state.hash)}
        onFavorite={() => toggleFav(state.hash)}
        hash={state.hash}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        canPrev={state.seedIndex > 0}
        onRename={(name) => dispatch({ type: "rename", name })}
        onHash={(hash) => dispatch({ type: "setHash", hash })}
        onPrev={() => dispatch({ type: "seedPrev" })}
        onNext={() => dispatch({ type: "seedNext" })}
        onReroll={() => dispatch({ type: "setHash", hash: randomHash() })}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onExportPNG={png}
        onExportSVG={() => {
          try {
            exportSVG(state.doc, state.hash).catch((e: unknown) => notify(t("app.exportFailed", { error: errorText(e, t) })));
          } catch (e) {
            notify(t("app.exportFailed", { error: errorText(e, t) }));
          }
        }}
        onExportJSON={() => {
          exportJSON(state.doc);
          dispatch({ type: "markSaved" });
        }}
        onImport={importFile}
        onCopyLink={() => {
          // Build the link from state now: the address bar updates on a debounce and may still be stale.
          const doc = state.doc;
          encodeState(doc, state.hash).then(
            (frag) => copy(`${window.location.origin}${window.location.pathname}#${frag}`, t("app.linkCopied"), () => dispatch({ type: "markSaved", doc })),
            () => notify(t("app.linkFailed")),
          );
        }}
        onToggleDebug={() => setDebug((d) => !d)}
        onMutate={() => setOverlay((o) => (o === "mutate" ? "none" : "mutate"))}
        onLibrary={() => setOverlay((o) => (o === "library" ? "none" : "library"))}
        onEdition={() => setOverlay((o) => (o === "edition" ? "none" : "edition"))}
        onLearn={() => setOverlay("lessons")}
        onShortcuts={() => setOverlay("shortcuts")}
      />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          id="sheet-layers"
          inert={behind}
          className={`panel-scroll order-2 h-[40dvh] shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-900 md:order-1 md:block md:h-auto md:w-60 md:border-r md:border-t-0 md:bg-zinc-900/60 ${sheet === "layers" ? "block" : "hidden"}`}
        >
          <LayerStack doc={state.doc} selectedId={state.selectedId} dispatch={dispatch} notRunning={notRunning} onAddScript={() => setOverlay("scriptStart")} />
        </aside>
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
        <main
          ref={viewportRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#27272a_0,#09090b_70%)]"
        >
          <canvas ref={canvasRef} className="rounded shadow-2xl shadow-black/60" />
          {tiled && (
            <TilePreview
              source={canvasRef}
              version={info}
              box={box}
              seamHint={(() => {
                const canvasLayer = state.doc.layers.find((l) => l.module === "canvas");
                const v = info.resolved.find((r) => r.id === canvasLayer?.id)?.values;
                const margin = Number(v?.["margin"] ?? 0);
                const corner = Number(v?.["cornerRadius"] ?? 0);
                return margin > 0 || corner > 0 ? t("app.seamHint") : null;
              })()}
            />
          )}
          <button
            type="button"
            className={`absolute bottom-3 right-3 z-20 rounded px-2 py-1 text-[11px] ring-1 ${tiled ? "bg-sky-700 text-white ring-sky-500" : "bg-zinc-900/80 text-zinc-300 ring-zinc-700 hover:bg-zinc-800"}`}
            aria-pressed={tiled}
            onClick={() => setTiled((x) => !x)}
            title={t("app.tileHint")}
          >
            {t("app.tile")}
          </button>
          {debug && <DebugPanel hash={state.hash} info={info} />}
          {info.error && !debug && (
            <div className="absolute bottom-3 left-3 rounded bg-red-950/90 px-2 py-1 text-xs text-red-300">{info.error}</div>
          )}
          <Suspense fallback={null}>
          {overlay === "mutate" && (
            <MutationGrid
              doc={state.doc}
              hash={state.hash}
              selectedId={state.selectedId}
              onAdopt={adopt}
              onClose={() => setOverlay("none")}
            />
          )}
          {overlay === "edition" && (
            <EditionPanel doc={state.doc} hash={state.hash} dispatch={dispatch} onClose={() => setOverlay("none")} notify={notify} />
          )}
          {overlay === "library" && (
            <Library
              doc={state.doc}
              hash={state.hash}
              onLoad={(doc, hash) => {
                adopt(doc, hash);
                dispatch({ type: "markSaved" });
                setOverlay("none");
                notify(t("app.loaded", { name: doc.name }));
              }}
              onSaved={() => dispatch({ type: "markSaved" })}
              onClose={() => setOverlay("none")}
              notify={notify}
            />
          )}
          {overlay === "shortcuts" && <ShortcutsHelp onClose={() => setOverlay("none")} />}
          {overlay === "scriptStart" && <ScriptStart onCreate={addScript} onLearn={() => setOverlay("lessons")} onClose={() => setOverlay("none")} />}
          {overlay === "lessons" && <LessonPicker onStart={(l) => void startLesson(l)} onClose={() => setOverlay("none")} />}
          {overlay === "code" && codeOf && (
            <CodeView
              moduleId={codeOf.id}
              label={codeOf.label}
              onClose={() => setOverlay("none")}
              notify={notify}
              {...(REMIXABLE.has(codeOf.id)
                ? {
                    onRemix: (script: LayerScript) => {
                      approveScripts([script.code]);
                      dispatch({ type: "remixLayer", layerId: codeOf.layerId, script });
                      setOverlay("none");
                      setEditingId(codeOf.layerId);
                      notify(t("app.remixed", { label: codeOf.label }), 3000);
                    },
                  }
                : {})}
            />
          )}
          </Suspense>
          {overlay === "welcome" && <Welcome onClose={() => setOverlay("none")} onPresets={() => setOverlay("library")} />}
          {untrusted.length > 0 && untrustedKey !== keptHidden && (
            <div role="region" aria-label={t("app.codeRegion")} className="absolute inset-x-3 top-3 z-20 mx-auto max-w-xl rounded-lg border border-amber-500/40 bg-zinc-900/95 p-3 text-xs text-zinc-200 shadow-xl shadow-black/50">
              <p className="font-semibold text-amber-200">{t("app.codeTitle")}</p>
              <p className="mt-1 leading-relaxed text-zinc-300">
                {untrusted.length === 1 ? t("app.codeOne") : t("app.codeMany", { n: untrusted.length })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-600" onClick={() => approveScripts(untrusted)}>
                  {t("app.runCode")}
                </button>
                {firstUntrusted && (
                  <button type="button" className="rounded bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700" onClick={() => setEditingId(firstUntrusted.id)}>
                    {t("app.showCode")}
                  </button>
                )}
                <button type="button" className="rounded px-2.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={() => setKeptHidden(untrustedKey)}>
                  {t("app.keepHidden")}
                </button>
              </div>
            </div>
          )}
          {toast && (
            <div className="absolute top-3 z-40 rounded-full bg-zinc-800/95 px-3 py-1 text-xs text-zinc-200 shadow">{toast}</div>
          )}
        </main>
        {editingLayer && (
          <div inert={behind} className="contents">
            <Suspense fallback={null}>
              <ScriptEditor
                key={editingLayer.id}
                layer={editingLayer}
                running={!untrusted.includes(editingLayer.script?.code ?? "")}
                renderError={info.error}
                onApply={applyScript}
                onClose={() => setEditingId(null)}
                {...(lesson && lesson.layerId === editingLayer.id
                  ? {
                      aside: (
                        <LessonPanel
                          lesson={lesson.lesson}
                          step={lesson.step}
                          busy={lessonBusy}
                          onStep={(step) => setLesson({ ...lesson, step: Math.max(0, Math.min(lesson.lesson.steps.length, step)) })}
                          onShowMe={(code) => void showMe(lesson.layerId, code)}
                          onEnd={() => setLesson(null)}
                        />
                      ),
                    }
                  : {})}
              />
            </Suspense>
          </div>
        )}
        {favorites.length > 0 && (
          <div inert={behind} className={sheet ? "hidden md:block" : undefined}>
            <FavoritesStrip
              doc={state.doc}
              hash={state.hash}
              favorites={favorites}
              onPick={(h) => dispatch({ type: "setHash", hash: h })}
              onRemove={toggleFav}
            />
          </div>
        )}
        </div>
        <aside
          id="sheet-params"
          inert={behind}
          className={`panel-scroll order-3 h-[40dvh] shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-900 md:block md:h-auto md:w-80 md:border-l md:border-t-0 md:bg-zinc-900/60 ${sheet === "params" ? "block" : "hidden"}`}
        >
          <ParamPanel
            layer={selected}
            resolved={info.resolved.find((r) => r.id === state.selectedId)}
            onChange={onParam}
            onCheckpoint={() => dispatch({ type: "checkpoint" })}
            onResetParam={(layerId, name) => dispatch({ type: "resetParam", layerId, name })}
            onResetLayer={(layerId) => dispatch({ type: "resetLayer", layerId })}
            onEditScript={setEditingId}
            onViewCode={(id, label, layerId) => {
              setCodeOf({ id, label, layerId });
              setOverlay("code");
            }}
            problem={problem}
          />
          <ScrollHints />
        </aside>
        <nav inert={behind} aria-label={t("app.panels")} className="order-4 flex shrink-0 border-t border-zinc-800 bg-zinc-900 md:hidden">
          {(
            [
              ["layers", t("app.panelLayers"), "sheet-layers"],
              ["params", selected ? (layerDef(defaultRegistry, selected)?.label ?? selected.module) : t("app.panelParams"), "sheet-params"],
            ] as const
          ).map(([id, label, controls]) => (
            <button
              key={id}
              type="button"
              className={`flex-1 truncate px-3 py-2.5 text-xs ${sheet === id ? "bg-zinc-800 text-white" : "text-zinc-400"}`}
              aria-expanded={sheet === id}
              aria-controls={controls}
              onClick={() => setSheet((s) => (s === id ? null : id))}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

