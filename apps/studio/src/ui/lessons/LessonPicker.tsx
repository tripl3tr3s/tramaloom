import { useState } from "react";
import { useDialog } from "../../hooks/useDialog.ts";
import { useLang } from "../../i18n/i18n.tsx";
import { GLOSSARY, PLOT_GUIDE } from "../../lessons/guides.ts";
import type { Lesson } from "../../lessons/lessons.ts";
import { LESSONS } from "../../lessons/lessons.ts";
import { LangSwitch } from "../LangSwitch.tsx";
import { LessonText } from "./LessonText.tsx";

interface Props {
  readonly onStart: (lesson: Lesson) => void;
  readonly onClose: () => void;
}

type Tab = "lessons" | "guide" | "glossary";

/** Learn: the coding lessons, a no-code plotting guide and a glossary. */
export function LessonPicker({ onStart, onClose }: Props) {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<Tab>("lessons");
  const ref = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  });
  const tabs: readonly [Tab, string][] = [
    ["lessons", t("lessons.title")],
    ["guide", t("learn.guide")],
    ["glossary", t("learn.glossary")],
  ];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 max-md:fixed max-md:p-0" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-title"
        lang={lang}
        className="flex max-h-full w-full max-w-2xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 shadow-2xl shadow-black/60 outline-none max-md:h-full max-md:rounded-none max-md:border-0"
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <h2 id="learn-title" className="flex-1 text-sm font-semibold text-white">
            {t("learn.title")}
          </h2>
          <LangSwitch />
          <button type="button" className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
        <div role="tablist" aria-label={t("learn.tabs")} className="flex flex-wrap gap-1 border-b border-zinc-800 px-4 pb-2 pt-3">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`rounded px-2 py-1 ${tab === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="panel-scroll min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "lessons" && (
            <>
              <p className="mb-3 leading-relaxed text-zinc-400">{t("lessons.intro")}</p>
              <ol className="flex flex-col gap-2">
                {LESSONS.map((lesson, i) => (
                  <li key={lesson.id} className="flex items-start gap-3 rounded-md border border-zinc-800 p-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-200">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-zinc-100">{lesson.title[lang]}</h3>
                      <p className="mt-0.5 leading-snug text-zinc-400">{lesson.summary[lang]}</p>
                    </div>
                    <button type="button" className="shrink-0 rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-600" onClick={() => onStart(lesson)}>
                      {t("lessons.start")}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
          {tab === "guide" && (
            <>
              <p className="mb-3 leading-relaxed text-zinc-400">{PLOT_GUIDE.summary[lang]}</p>
              <ol className="flex flex-col gap-3">
                {PLOT_GUIDE.steps.map((step, i) => (
                  <li key={step.title.en} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-200">{i + 1}</span>
                    <div className="min-w-0 flex-1 leading-relaxed">
                      <h3 className="mb-1 font-semibold text-zinc-100">{step.title[lang]}</h3>
                      <LessonText text={step.body[lang]} />
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
          {tab === "glossary" && (
            <>
              <p className="mb-3 leading-relaxed text-zinc-400">{t("learn.glossaryIntro")}</p>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[9rem_1fr]">
                {GLOSSARY.map((entry) => (
                  <div key={entry.term.en} className="contents">
                    <dt className="font-semibold text-zinc-100">{entry.term[lang]}</dt>
                    <dd className="mb-1 leading-relaxed text-zinc-400 sm:mb-0">{entry.meaning[lang]}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
