import { useDialog } from "../hooks/useDialog.ts";

const KEY = "gridloom.welcomed";

/** First visit in this browser. Storage that throws counts as seen, so a blocked store never nags. */
export function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(KEY) === null;
  } catch {
    return false;
  }
}

function rememberWelcomed(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Nothing to do: the card simply shows again next time.
  }
}

interface Props {
  readonly onClose: () => void;
  readonly onPresets: () => void;
}

const kbd = "rounded border border-zinc-700 bg-zinc-800 px-1.5 py-px font-sans text-[11px] text-zinc-200";

const TIPS: readonly { readonly keys: readonly string[]; readonly text: string }[] = [
  { keys: ["R", "Left", "Right"], text: "A piece is a stack of layers plus a seed. R draws a new seed; the arrows walk back and forth through the ones you saw." },
  { keys: ["vary", "lock"], text: "Vary hands a parameter to the seed, inside a range you set. Lock freezes it at a fixed value." },
  { keys: ["M", "L"], text: "M shows mutations of the current piece; L opens presets to start from." },
  { keys: ["B", "?"], text: "B stars a seed for later. Export saves images, the document or a share link, and ? lists every shortcut." },
];

/** First-run card: four tips and a way into the presets. */
export function Welcome({ onClose, onPresets }: Props) {
  const close = () => {
    rememberWelcomed();
    onClose();
  };
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-auto bg-black/60 p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl shadow-black/60 outline-none"
      >
        <h2 id="welcome-title" className="text-base font-semibold text-white">
          Welcome to Gridloom
        </h2>
        <p className="mt-1 text-xs text-zinc-400">Generative grid art, made in the browser. Nothing leaves this device unless you share it.</p>
        <ul className="mt-4 flex flex-col gap-3">
          {TIPS.map((t) => (
            <li key={t.text} className="flex gap-3 text-xs leading-relaxed text-zinc-300">
              <span className="flex w-24 shrink-0 flex-wrap content-start gap-1">
                {t.keys.map((k) => (
                  <kbd key={k} className={kbd}>
                    {k}
                  </kbd>
                ))}
              </span>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            onClick={() => {
              rememberWelcomed();
              onPresets();
            }}
          >
            Browse presets
          </button>
          <button type="button" className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-600" onClick={close}>
            Start making
          </button>
        </div>
      </div>
    </div>
  );
}
