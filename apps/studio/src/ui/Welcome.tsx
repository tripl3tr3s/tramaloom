import { useDialog } from "../hooks/useDialog.ts";
import { useLang } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { MESSAGES } from "../i18n/messages.ts";
import { LangSwitch } from "./LangSwitch.tsx";

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

// Keys are shown as they are, or as the button names they stand for (which follow the language).
const TIPS: readonly { readonly keys: readonly (string | MessageKey)[]; readonly text: MessageKey }[] = [
  { keys: ["R", "←", "→"], text: "welcome.tipSeeds" },
  { keys: ["param.vary", "param.lock"], text: "welcome.tipVary" },
  { keys: ["M", "L"], text: "welcome.tipMutate" },
  { keys: ["toolbar.learn"], text: "welcome.tipLearn" },
  { keys: ["B", "?"], text: "welcome.tipMore" },
];

/** First-run card: four tips and a way into the presets. */
export function Welcome({ onClose, onPresets }: Props) {
  const { t } = useLang();
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
        <div className="flex items-start gap-2">
          <h2 id="welcome-title" className="flex-1 text-base font-semibold text-white">
            {t("welcome.title")}
          </h2>
          <LangSwitch />
        </div>
        <p className="mt-1 text-xs text-zinc-400">{t("welcome.intro")}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {TIPS.map((tip) => (
            <li key={tip.text} className="flex gap-3 text-xs leading-relaxed text-zinc-300">
              <span className="flex w-24 shrink-0 flex-wrap content-start gap-1">
                {tip.keys.map((k) => (
                  <kbd key={k} className={kbd}>
                    {Object.hasOwn(MESSAGES.en, k) ? t(k as MessageKey) : k}
                  </kbd>
                ))}
              </span>
              <span>{t(tip.text)}</span>
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
            {t("welcome.browse")}
          </button>
          <button type="button" className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-600" onClick={close}>
            {t("welcome.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
