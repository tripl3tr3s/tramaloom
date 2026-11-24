import { PALETTES } from "@tramaloom/core";
import { useId } from "react";
import { useLang } from "../i18n/i18n.tsx";

export type OptionSwatches = Readonly<Record<string, readonly string[]>>;

/**
 * Enum params whose options are best chosen by eye, keyed "module.param".
 * A module param listed here gets a swatch picker instead of a dropdown.
 */
const SWATCHES: Readonly<Record<string, OptionSwatches>> = {
  "palette.palette": PALETTES,
};

export const swatchesFor = (module: string, param: string): OptionSwatches | undefined => SWATCHES[`${module}.${param}`];

export function Swatch({ colors, className = "h-4" }: { readonly colors: readonly string[]; readonly className?: string }) {
  return (
    <span className={`flex overflow-hidden rounded-sm ring-1 ring-black/40 ${className}`} aria-hidden="true">
      {colors.map((c, i) => (
        <span key={i} className="flex-1" style={{ background: c }} />
      ))}
    </span>
  );
}

interface PickerProps {
  readonly label: string;
  readonly options: readonly string[];
  readonly swatches: OptionSwatches;
  readonly value: string;
  /** While the param varies: the option this seed drew, marked separately from the fixed choice. */
  readonly drawn?: string | undefined;
  readonly onPick: (option: string) => void;
}

/** Radio group of palettes: arrow keys move between them, as with native radios. */
export function SwatchPicker({ label, options, swatches, value, drawn, onPick }: PickerProps) {
  const { t } = useLang();
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1">
      {options.map((o) => {
        const on = o === value;
        const isDrawn = drawn !== undefined && o === drawn;
        return (
          <label
            key={o}
            className={`cursor-pointer rounded p-1 ring-1 has-[:focus-visible]:ring-sky-400 ${on ? "bg-zinc-800 ring-sky-500" : "ring-transparent hover:bg-zinc-800/60"}`}
          >
            <input type="radio" name={name} value={o} checked={on} onChange={() => onPick(o)} className="sr-only" />
            <Swatch colors={swatches[o] ?? []} />
            <span className={`mt-1 flex items-center gap-1 text-[10px] ${on || isDrawn ? "text-zinc-100" : "text-zinc-400"}`}>
              <span className="flex-1 truncate">{o}</span>
              {isDrawn && <span className="rounded bg-sky-500/20 px-1 text-[9px] text-sky-300">{t("swatch.thisSeed")}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
