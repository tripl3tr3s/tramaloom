import { useDialog } from "../../hooks/useDialog.ts";
import { UI } from "../../lessons/lang.ts";
import type { Lang, Lesson } from "../../lessons/lessons.ts";
import { LESSONS } from "../../lessons/lessons.ts";
import { LangSwitch } from "./LessonText.tsx";

interface Props {
  readonly lang: Lang;
  readonly onLang: (lang: Lang) => void;
  readonly onStart: (lesson: Lesson) => void;
  readonly onClose: () => void;
}

/** The list of lessons. Starting one adds its script layer and opens the editor with its steps. */
export function LessonPicker({ lang, onLang, onStart, onClose }: Props) {
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  });
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-auto bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lessons-title"
        lang={lang}
        className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-300 shadow-2xl shadow-black/60 outline-none"
      >
        <div className="mb-2 flex items-center gap-2">
          <h2 id="lessons-title" className="flex-1 text-sm font-semibold text-white">
            {UI.lessons[lang]}
          </h2>
          <LangSwitch lang={lang} onLang={onLang} label={UI.language[lang]} />
          <button type="button" className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            {UI.close[lang]}
          </button>
        </div>
        <p className="mb-3 leading-relaxed text-zinc-400">{UI.intro[lang]}</p>
        <ol className="flex flex-col gap-2">
          {LESSONS.map((lesson, i) => (
            <li key={lesson.id} className="flex items-start gap-3 rounded-md border border-zinc-800 p-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-200">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-zinc-100">{lesson.title[lang]}</h3>
                <p className="mt-0.5 leading-snug text-zinc-400">{lesson.summary[lang]}</p>
              </div>
              <button type="button" className="shrink-0 rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-600" onClick={() => onStart(lesson)}>
                {UI.start[lang]}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
