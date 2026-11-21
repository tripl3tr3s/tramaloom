import { useLang } from "../i18n/i18n.tsx";

/** EN / ES switch for the whole studio. */
export function LangSwitch({ className = "" }: { readonly className?: string }) {
  const { lang, setLang, t } = useLang();
  return (
    <div role="group" aria-label={t("lang.label")} className={`inline-flex overflow-hidden rounded border border-zinc-700 text-[11px] ${className}`}>
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          lang={l}
          title={l === "en" ? "English" : "Español"}
          className={`px-1.5 py-0.5 uppercase ${lang === l ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
          onClick={() => setLang(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
