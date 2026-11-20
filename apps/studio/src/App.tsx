import type { ArtDocument, ParamSetting } from "@gridloom/core";
import { defaultRegistry, ENGINE_VERSION, getModule, starterDocument } from "@gridloom/core";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useShortcuts } from "./hooks/useShortcuts.ts";
import { useUrlSync } from "./hooks/useUrlSync.ts";
import { exportJSON, exportPNG, exportSVG } from "./render/export.ts";
import { useRenderer } from "./render/useRenderer.ts";
import { loadFavorites, MAX_FAVORITES, saveFavorites, toggleFavorite } from "./state/favorites.ts";
import { needsGrid, promoteIndex } from "./state/layerOrder.ts";
import { parseDocument } from "./state/schema.ts";
import { encodeState } from "./state/url.ts";
import { initialState, randomHash, reducer } from "./state/store.ts";
import { DebugPanel } from "./ui/DebugPanel.tsx";
import { LayerStack } from "./ui/LayerStack.tsx";
import { Library } from "./ui/Library.tsx";
import { MutationGrid } from "./ui/MutationGrid.tsx";
import { EditionPanel } from "./ui/edition/EditionPanel.tsx";
import { FavoritesStrip } from "./ui/FavoritesStrip.tsx";
import { ParamPanel } from "./ui/ParamPanel.tsx";
import { ShortcutsHelp } from "./ui/ShortcutsHelp.tsx";
import { TilePreview } from "./ui/TilePreview.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";
import { isFirstVisit, Welcome } from "./ui/Welcome.tsx";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(starterDocument, randomHash()));
  const [debug, setDebug] = useState(false);
  const [overlay, setOverlay] = useState<"none" | "mutate" | "library" | "edition" | "shortcuts" | "welcome">(() => (isFirstVisit() ? "welcome" : "none"));
  const [toast, setToast] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<readonly string[]>(loadFavorites);
  // Phones: which panel is open as a bottom sheet (null shows the art alone). Ignored from md up.
  const [sheet, setSheet] = useState<"layers" | "params" | null>(null);
  const [tiled, setTiled] = useState(false);
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
      notify(`This link was made with engine v${engine}; this is v${ENGINE_VERSION}, so it may look different`, 6000);
    }
  });

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
      notify(`Rendering ${size}px PNG`);
      exportPNG(state.doc, state.hash, size).catch((e: unknown) => notify(`Export failed: ${String(e)}`));
    },
    [state.doc, state.hash, notify],
  );
  const copy = (text: string, msg: string, onDone?: () => void) =>
    navigator.clipboard.writeText(text).then(
      () => {
        notify(msg);
        onDone?.();
      },
      () => notify("Clipboard unavailable"),
    );
  const importFile = async (file: File) => {
    try {
      const doc = parseDocument(JSON.parse(await file.text()));
      if (!doc) return notify("Not a valid Gridloom document");
      dispatch({ type: "loadDoc", doc });
      notify(`Opened ${doc.name}`);
    } catch {
      notify("Could not read that file");
    }
  };

  const toggleFav = (h: string) => {
    const next = toggleFavorite(favorites, h);
    if (!favorites.includes(h) && favorites.length >= MAX_FAVORITES) {
      notify(`Favourites keep the newest ${MAX_FAVORITES} seeds; the oldest one was dropped`, 3000);
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
    c: () => copy(state.hash, "Hash copied"),
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
        message: "This layer draws into the grid's cells, but the Grid layer runs after it, so there is nothing to draw on yet.",
        fix: "Use it as the main grid",
        onFix: () => dispatch({ type: "promoteLayer", layerId: stranded.id }),
      };
    }
    if (hidden) {
      return {
        message: "This layer draws into the grid's cells, but the Grid layer is hidden.",
        fix: "Show Grid",
        onFix: () => dispatch({ type: "toggleLayer", layerId: hidden.id }),
      };
    }
    return {
      message: "This layer draws into the grid's cells, and there is no Grid layer.",
      fix: "Add a Grid layer",
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
            exportSVG(state.doc, state.hash);
          } catch (e) {
            notify(`Export failed: ${String(e)}`);
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
            (frag) => copy(`${window.location.origin}${window.location.pathname}#${frag}`, "Link copied", () => dispatch({ type: "markSaved", doc })),
            () => notify("Could not build the link"),
          );
        }}
        onToggleDebug={() => setDebug((d) => !d)}
        onMutate={() => setOverlay((o) => (o === "mutate" ? "none" : "mutate"))}
        onLibrary={() => setOverlay((o) => (o === "library" ? "none" : "library"))}
        onEdition={() => setOverlay((o) => (o === "edition" ? "none" : "edition"))}
        onShortcuts={() => setOverlay("shortcuts")}
      />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          id="sheet-layers"
          inert={behind}
          className={`panel-scroll order-2 h-[40dvh] shrink-0 overflow-y-auto border-t border-zinc-800 bg-zinc-900 md:order-1 md:block md:h-auto md:w-60 md:border-r md:border-t-0 md:bg-zinc-900/60 ${sheet === "layers" ? "block" : "hidden"}`}
        >
          <LayerStack doc={state.doc} selectedId={state.selectedId} dispatch={dispatch} />
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
                return margin > 0 || corner > 0 ? "Set the Canvas margin and corner radius to 0 for a seamless repeat" : null;
              })()}
            />
          )}
          <button
            type="button"
            className={`absolute bottom-3 right-3 z-20 rounded px-2 py-1 text-[11px] ring-1 ${tiled ? "bg-sky-700 text-white ring-sky-500" : "bg-zinc-900/80 text-zinc-300 ring-zinc-700 hover:bg-zinc-800"}`}
            aria-pressed={tiled}
            onClick={() => setTiled((x) => !x)}
            title="Repeat the piece 3x3 to check that edges join (T)"
          >
            Tile 3x3
          </button>
          {debug && <DebugPanel hash={state.hash} info={info} />}
          {info.error && !debug && (
            <div className="absolute bottom-3 left-3 rounded bg-red-950/90 px-2 py-1 text-xs text-red-300">{info.error}</div>
          )}
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
                notify(`Loaded ${doc.name}`);
              }}
              onSaved={() => dispatch({ type: "markSaved" })}
              onClose={() => setOverlay("none")}
              notify={notify}
            />
          )}
          {overlay === "shortcuts" && <ShortcutsHelp onClose={() => setOverlay("none")} />}
          {overlay === "welcome" && <Welcome onClose={() => setOverlay("none")} onPresets={() => setOverlay("library")} />}
          {toast && (
            <div className="absolute top-3 z-40 rounded-full bg-zinc-800/95 px-3 py-1 text-xs text-zinc-200 shadow">{toast}</div>
          )}
        </main>
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
            problem={problem}
          />
        </aside>
        <nav inert={behind} aria-label="Panels" className="order-4 flex shrink-0 border-t border-zinc-800 bg-zinc-900 md:hidden">
          {(
            [
              ["layers", "Layers", "sheet-layers"],
              ["params", selected ? (getModule(defaultRegistry, selected.module)?.label ?? selected.module) : "Params", "sheet-params"],
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

