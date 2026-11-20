import type { ArtDocument } from "@gridloom/core";
import { useCallback, useState } from "react";
import { isTypingTarget, useDialog } from "../../hooks/useDialog.ts";
import type { Action } from "../../state/store.ts";
import { BatchTab } from "./BatchTab.tsx";
import { CensusTab } from "./CensusTab.tsx";
import { MintTab } from "./MintTab.tsx";
import { PlotterTab } from "./PlotterTab.tsx";
import { SheetTab } from "./SheetTab.tsx";
import { TraitsTab } from "./TraitsTab.tsx";

const TABS = [
  ["traits", "Traits & rarity"],
  ["census", "Census"],
  ["sheet", "Contact sheet"],
  ["batch", "Batch export"],
  ["plotter", "Plotter"],
  ["mint", "Mint export"],
] as const;
type Tab = (typeof TABS)[number][0];

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly dispatch: (a: Action) => void;
  readonly onClose: () => void;
  readonly notify: (msg: string) => void;
}

/** Long-form tools: what an edition of this piece looks like across many seeds. */
export function EditionPanel({ doc, hash, dispatch, onClose, notify }: Props) {
  const [tab, setTab] = useState<Tab>("traits");
  // Tabs mount on first visit and then stay mounted (hidden), so switching tabs
  // never cancels a running census or batch, nor drops their results.
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(() => new Set<Tab>(["traits"]));
  const [batchBusy, setBatchBusy] = useState(false);
  const open = (t: Tab) => {
    setTab(t);
    setVisited((v) => (v.has(t) ? v : new Set([...v, t])));
  };
  const close = () => {
    if (batchBusy) return notify("A batch export is running: wait for it or cancel it first");
    onClose();
  };
  const onBusy = useCallback((b: boolean) => setBatchBusy(b), []);
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      if (isTypingTarget(e.target) && e.target instanceof HTMLElement) return e.target.blur();
      e.preventDefault();
      close();
    } else if (!isTypingTarget(e.target) && e.key.toLowerCase() === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      close();
    } else if (e.target instanceof HTMLElement && e.target.getAttribute("role") === "tab" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      // Arrow keys move between tabs.
      e.preventDefault();
      const i = TABS.findIndex(([id]) => id === tab);
      const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
      if (next) {
        open(next[0]);
        document.getElementById(`edition-tab-${next[0]}`)?.focus();
      }
    }
  });

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Edition"
      className="absolute inset-0 z-30 flex flex-col gap-3 overflow-auto bg-zinc-950 p-4 outline-none"
    >
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-2 font-semibold text-white">Edition</span>
        <div role="tablist" className="flex gap-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              id={`edition-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`edition-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => open(id)}
              className={`rounded px-2 py-0.5 ${tab === id ? "bg-zinc-200 text-zinc-900" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700" onClick={close}>
          Done (Esc)
        </button>
      </div>
      {TABS.map(([id]) =>
        visited.has(id) ? (
          <div
            key={id}
            id={`edition-panel-${id}`}
            role="tabpanel"
            aria-labelledby={`edition-tab-${id}`}
            hidden={tab !== id}
            className="mx-auto w-full max-w-5xl"
          >
            {id === "traits" && <TraitsTab doc={doc} hash={hash} dispatch={dispatch} />}
            {id === "census" && <CensusTab doc={doc} />}
            {id === "sheet" && (
              <SheetTab
                doc={doc}
                hash={hash}
                notify={notify}
                onPick={(h) => {
                  if (batchBusy) return notify("A batch export is running: wait for it or cancel it first");
                  dispatch({ type: "setHash", hash: h });
                  onClose();
                }}
              />
            )}
            {id === "batch" && <BatchTab doc={doc} hash={hash} notify={notify} onBusy={onBusy} />}
            {id === "plotter" && <PlotterTab doc={doc} hash={hash} notify={notify} />}
            {id === "mint" && <MintTab doc={doc} hash={hash} notify={notify} />}
          </div>
        ) : null,
      )}
    </div>
  );
}
