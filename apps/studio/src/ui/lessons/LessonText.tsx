/** Lesson prose: paragraphs split on blank lines, `backticks` shown as code. Text only, never HTML. */
export function LessonText({ text }: { readonly text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="mt-2 first:mt-0">
          {para.split(/`([^`]+)`/).map((part, j) =>
            j % 2 === 1 ? (
              <code key={j} className="rounded bg-zinc-800 px-1 py-px font-mono text-[11px] text-zinc-100">
                {part}
              </code>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </>
  );
}

/** EN / ES switch for the lessons. */
export function LangSwitch({ lang, onLang, label }: { readonly lang: "en" | "es"; readonly onLang: (l: "en" | "es") => void; readonly label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded border border-zinc-700 text-[11px]">
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          className={`px-1.5 py-0.5 uppercase ${lang === l ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
          onClick={() => onLang(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
