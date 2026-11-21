import { useLang } from "../../i18n/i18n.tsx";
import type { Lesson } from "../../lessons/lessons.ts";
import { LangSwitch } from "../LangSwitch.tsx";
import { LessonText } from "./LessonText.tsx";

interface Props {
  readonly lesson: Lesson;
  /** Index into lesson.steps; steps.length means finished. */
  readonly step: number;
  readonly busy: boolean;
  readonly onStep: (step: number) => void;
  readonly onShowMe: (code: string) => void;
  readonly onEnd: () => void;
}

/** The current lesson step, shown beside the code it talks about. */
export function LessonPanel({ lesson, step, busy, onStep, onShowMe, onEnd }: Props) {
  const { lang, t } = useLang();
  const total = lesson.steps.length;
  const current = lesson.steps[step];
  return (
    <section aria-label={lesson.title[lang]} lang={lang} className="flex h-full flex-col gap-2 text-[12px] leading-relaxed text-zinc-300">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{lesson.title[lang]}</h3>
        <LangSwitch />
      </div>
      {current ? (
        <>
          <p className="text-[11px] text-zinc-500">
            {t("lessons.step", { n: step + 1, total })}
          </p>
          <h4 className="text-sm font-semibold text-white">{current.title[lang]}</h4>
          <div>
            <LessonText text={current.body[lang]} />
          </div>
        </>
      ) : (
        <p className="text-emerald-300/90">{t("lessons.finished")}</p>
      )}
      {/* Pinned to the bottom of the scrolling panel, so the steps can always be moved through. */}
      <div className="sticky bottom-0 -mx-3 -mb-2 mt-auto flex flex-wrap items-center gap-1.5 border-t border-zinc-800 bg-zinc-900 px-3 py-1.5">
        <button type="button" className="rounded px-2 py-0.5 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30" disabled={step === 0} onClick={() => onStep(step - 1)}>
          {t("lessons.back")}
        </button>
        {current?.code && (
          <button
            type="button"
            className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
            disabled={busy}
            title={t("lessons.showMeHint")}
            onClick={() => current.code && onShowMe(current.code(lang))}
          >
            {t("lessons.showMe")}
          </button>
        )}
        {current ? (
          <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600" onClick={() => onStep(step + 1)}>
            {step + 1 === total ? t("lessons.done") : t("lessons.next")}
          </button>
        ) : (
          <button type="button" className="rounded bg-sky-700 px-2 py-0.5 text-white hover:bg-sky-600" onClick={onEnd}>
            {t("lessons.end")}
          </button>
        )}
        {current && (
          <button type="button" className="ml-auto rounded px-2 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" onClick={onEnd}>
            {t("lessons.end")}
          </button>
        )}
      </div>
    </section>
  );
}
