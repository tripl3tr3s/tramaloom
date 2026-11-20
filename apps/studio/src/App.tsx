import type { ArtDocument, ParamSetting } from "@gridloom/core";
import { ENGINE_VERSION, starterDocument } from "@gridloom/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useShortcuts } from "./hooks/useShortcuts.ts";
import { useUrlSync } from "./hooks/useUrlSync.ts";
import { exportJSON, exportPNG, exportSVG } from "./render/export.ts";
import { useRenderer } from "./render/useRenderer.ts";
import { parseDocument } from "./state/schema.ts";
import { initialState, randomHash, reducer } from "./state/store.ts";
import { DebugPanel } from "./ui/DebugPanel.tsx";
import { LayerStack } from "./ui/LayerStack.tsx";
import { Library } from "./ui/Library.tsx";
import { MutationGrid } from "./ui/MutationGrid.tsx";
import { EditionPanel } from "./ui/edition/EditionPanel.tsx";
import { ParamPanel } from "./ui/ParamPanel.tsx";
import { ShortcutsHelp } from "./ui/ShortcutsHelp.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(starterDocument, randomHash()));
  const [debug, setDebug] = useState(false);
  const [overlay, setOverlay] = useState<"none" | "mutate" | "library" | "edition" | "shortcuts">("none");
  const [toast, setToast] = useState<string | null>(null);
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
    s: () => png(2000),
    "shift+s": () => png(4000),
    g: () => setDebug((d) => !d),
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

  const selected = state.doc.layers.find((l) => l.id === state.selectedId);
  const onParam = (layerId: string, name: string, setting: ParamSetting, record: boolean) =>
    dispatch({ type: "setParam", layerId, name, setting, record });

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-200">
      <div className="contents" inert={behind}>
      <Toolbar
        name={state.doc.name}
        unsaved={state.doc !== state.savedDoc}
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
        onCopyLink={() => copy(window.location.href, "Link copied", () => dispatch({ type: "markSaved" }))}
        onToggleDebug={() => setDebug((d) => !d)}
        onMutate={() => setOverlay((o) => (o === "mutate" ? "none" : "mutate"))}
        onLibrary={() => setOverlay((o) => (o === "library" ? "none" : "library"))}
        onEdition={() => setOverlay((o) => (o === "edition" ? "none" : "edition"))}
        onShortcuts={() => setOverlay("shortcuts")}
      />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside inert={behind} className="order-2 max-h-48 overflow-y-auto border-zinc-800 bg-zinc-900/60 md:order-1 md:max-h-none md:w-60 md:border-r">
          <LayerStack doc={state.doc} selectedId={state.selectedId} dispatch={dispatch} />
        </aside>
        <main
          ref={viewportRef}
          className="relative order-1 flex min-h-[50vh] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#27272a_0,#09090b_70%)] md:order-2 md:min-h-0"
        >
          <canvas ref={canvasRef} className="rounded shadow-2xl shadow-black/60" />
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
          {toast && (
            <div className="absolute top-3 z-40 rounded-full bg-zinc-800/95 px-3 py-1 text-xs text-zinc-200 shadow">{toast}</div>
          )}
        </main>
        <aside inert={behind} className="order-3 max-h-[40vh] overflow-y-auto border-zinc-800 bg-zinc-900/60 md:max-h-none md:w-72 md:border-l">
          <ParamPanel
            layer={selected}
            resolved={info.resolved.find((r) => r.id === state.selectedId)}
            onChange={onParam}
            onCheckpoint={() => dispatch({ type: "checkpoint" })}
            onResetParam={(layerId, name) => dispatch({ type: "resetParam", layerId, name })}
            onResetLayer={(layerId) => dispatch({ type: "resetLayer", layerId })}
          />
        </aside>
      </div>
    </div>
  );
}

