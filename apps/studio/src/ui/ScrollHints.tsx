import { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/i18n.tsx";

interface Hints {
  readonly above: boolean;
  /** Title of the first section starting below the visible area, or "" for unnamed content. */
  readonly below: string | null;
}

const SLACK = 8;
/** Height of the bottom fade (h-16): a heading under it reads as hidden, not shown. */
const FADE = 64;

/**
 * Edge hints for a scrolling panel: a shadow at the top once scrolled, and at the
 * bottom a fade with a "More: <next section>" button while anything is hidden
 * below. Place it as the last child of the scrolling element. Sections are found
 * by their [data-section] title.
 */
export function ScrollHints() {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hints, setHints] = useState<Hints>({ above: false, below: null });

  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const more = scrollTop + clientHeight < scrollHeight - SLACK;
      const bottom = scroller.getBoundingClientRect().bottom;
      const next = more ? [...scroller.querySelectorAll<HTMLElement>("[data-section]")].find((s) => s.getBoundingClientRect().top > bottom - FADE) : undefined;
      // The top edge is a CSS shadow on the panel itself (styles.css), keyed off this attribute.
      scroller.toggleAttribute("data-scrolled", scrollTop > SLACK);
      setHints((h) => {
        const below = more ? (next?.dataset["section"] ?? "") : null;
        const above = scrollTop > SLACK;
        return h.above === above && h.below === below ? h : { above, below };
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    // Content changes size when a layer is selected or a section folds.
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    [...scroller.children].forEach((c) => ro.observe(c));
    const mo = new MutationObserver(() => {
      [...scroller.children].forEach((c) => ro.observe(c));
      update();
    });
    mo.observe(scroller, { childList: true, subtree: true });
    return () => {
      scroller.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const showNext = () => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bottom = scroller.getBoundingClientRect().bottom;
    const next = [...scroller.querySelectorAll<HTMLElement>("[data-section]")].find((s) => s.getBoundingClientRect().top > bottom - FADE);
    if (next) next.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    else scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: smooth ? "smooth" : "auto" });
  };

  // A zero-height sticky anchor: it rides the panel's bottom edge without taking up space.
  return (
      <div ref={ref} className="pointer-events-none sticky bottom-0 h-0" aria-hidden={hints.below === null}>
        {hints.below !== null && (
          <div className="absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent pb-2">
            <button
              type="button"
              onClick={showNext}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-200 shadow-lg shadow-black/50 ring-1 ring-zinc-700 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-sky-500"
            >
              {hints.below ? t("scroll.more", { name: hints.below }) : t("scroll.below")}
              <span aria-hidden="true">↓</span>
            </button>
          </div>
        )}
      </div>
  );
}
