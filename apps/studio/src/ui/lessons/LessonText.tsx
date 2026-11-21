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
