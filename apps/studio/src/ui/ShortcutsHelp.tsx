import { useDialog } from "../hooks/useDialog.ts";
import { SHORTCUT_GROUPS } from "./shortcuts.ts";

interface Props {
  readonly onClose: () => void;
}

const apple = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const keyName = (k: string): string => (k === "Mod" ? (apple ? "Cmd" : "Ctrl") : k);

/** Cheat sheet of every shortcut. ? or Escape closes it, as does a click outside the card. */
export function ShortcutsHelp({ onClose }: Props) {
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape" || e.key === "?") {
      e.preventDefault();
      onClose();
    }
  });
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-auto bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="w-full max-w-2xl rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-2xl shadow-black/60 outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-white">
            Keyboard shortcuts
          </h2>
          <button type="button" className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.title}</h3>
              <dl className="flex flex-col gap-1">
                {g.items.map((item) => (
                  <div key={item.does} className="flex items-baseline justify-between gap-3 text-xs">
                    <dt className="flex shrink-0 flex-wrap items-center gap-1">
                      {item.combos.map((combo, i) => (
                        <span key={combo.join("+")} className="flex items-center gap-0.5">
                          {i > 0 && <span className="px-0.5 text-zinc-600">/</span>}
                          {combo.map((k) => (
                            <kbd key={k} className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-px font-sans text-[11px] text-zinc-200">
                              {keyName(k)}
                            </kbd>
                          ))}
                        </span>
                      ))}
                    </dt>
                    <dd className="text-right text-zinc-400">{item.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
