import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  readonly label: string;
  /** Second line, for items that need explaining (module descriptions). */
  readonly description?: string;
  /** Right-aligned hint, usually the keyboard shortcut. */
  readonly hint?: string;
  readonly separatorBefore?: boolean;
  readonly onSelect: () => void;
}

interface Props {
  /** Accessible name of the trigger. */
  readonly label: string;
  /** Visible trigger content. */
  readonly trigger: ReactNode;
  readonly triggerClass: string;
  readonly items: readonly MenuItem[];
  readonly align?: "left" | "right";
  readonly disabled?: boolean;
  readonly title?: string;
  readonly width?: string;
}

/**
 * Menu button following the WAI-ARIA menu pattern: Enter, Space or ArrowDown
 * opens it on the first item, arrows/Home/End move, Escape closes and returns
 * focus to the trigger, Tab or a click outside closes it. Keys pressed inside
 * stop here, so the studio's single-letter shortcuts never fire behind it.
 */
export function Menu({ label, trigger, triggerClass, items, align = "left", disabled, title, width = "w-56" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const focusItem = (i: number) => {
    const n = items.length;
    if (n === 0) return;
    itemRefs.current[((i % n) + n) % n]?.focus();
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusItem(0);
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // Runs on open only; focusItem reads refs, so it needs no dependency.
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const at = itemRefs.current.findIndex((el) => el === document.activeElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return focusItem(at + 1);
      case "ArrowUp":
        e.preventDefault();
        return focusItem(at - 1);
      case "Home":
        e.preventDefault();
        return focusItem(0);
      case "End":
        e.preventDefault();
        return focusItem(items.length - 1);
      case "Escape":
        e.preventDefault();
        return close(true);
      case "Tab":
        return close(false);
    }
  };

  const onTriggerKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={triggerClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute top-full z-50 mt-1 ${width} ${align === "right" ? "right-0" : "left-0"} rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-xl shadow-black/50`}
        >
          {items.map((item, i) => (
            <div key={item.label} role="none">
              {item.separatorBefore && <div role="separator" className="my-1 h-px bg-zinc-800" />}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="flex w-full items-start gap-3 rounded px-2 py-1.5 text-left text-xs text-zinc-200 outline-none hover:bg-zinc-800 focus:bg-sky-900/60"
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  {item.description && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{item.description}</span>}
                </span>
                {item.hint && <kbd className="shrink-0 font-sans text-[10px] text-zinc-500">{item.hint}</kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
