import { useLang } from "../i18n/i18n.tsx";

export const AUTHOR = "tripl3tr3s";
export const AUTHOR_URL = "https://tripl3.dev";
export const SOURCE_URL = "https://github.com/tripl3tr3s/tramaloom";

const link = "text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200 hover:decoration-zinc-400";

/** One quiet line naming the author and linking the source. Credits the tool, never the user's pieces. */
export function Credit({ className = "" }: { readonly className?: string }) {
  const { t } = useLang();
  return (
    <p className={`text-[11px] text-zinc-500 ${className}`}>
      {t("credit.madeBy")}{" "}
      <a className={link} href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
        {AUTHOR}
      </a>
      <span className="px-1.5 text-zinc-600" aria-hidden="true">
        ·
      </span>
      <a className={link} href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
        {t("credit.source")}
      </a>
    </p>
  );
}
