import type { Layer, ParamSetting, ResolvedLayer } from "@tramaloom/core";
import { defaultRegistry, layerDef, SCRIPT_MODULE } from "@tramaloom/core";
import { useState } from "react";
import { useCoreText } from "../i18n/coreText.ts";
import { useLang } from "../i18n/i18n.tsx";
import { ChevronIcon } from "./icons.tsx";
import { groupParams, isDefaultSetting, isRelevant } from "./params.ts";
import { ParamRow } from "./ParamRow.tsx";
import { swatchesFor } from "./Swatches.tsx";

interface Props {
  readonly layer: Layer | undefined;
  readonly resolved: ResolvedLayer | undefined;
  readonly onChange: (layerId: string, name: string, setting: ParamSetting, record: boolean) => void;
  readonly onCheckpoint: () => void;
  readonly onResetParam: (layerId: string, name: string) => void;
  readonly onResetLayer: (layerId: string) => void;
  /** Opens the source of the module behind this layer. */
  readonly onViewCode: (moduleId: string, label: string, layerId: string) => void;
  /** Opens the code editor of a script layer. */
  readonly onEditScript: (layerId: string) => void;
  /** Shown above the params when this layer cannot draw as it stands, with a one-click fix. */
  readonly problem?: { readonly message: string; readonly fix: string; readonly onFix: () => void } | null;
}

const COLLAPSED_KEY = "tramaloom.collapsedGroups";

/** Which groups this viewer folded away ("module/Group"). A convenience only, so storage failures are ignored. */
function useCollapsed(): readonly [ReadonlySet<string>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
      return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set();
    }
  });
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // Private mode or blocked storage: the fold still works for this session.
      }
      return next;
    });
  return [collapsed, toggle];
}

const HELP_KEY = "tramaloom.showHelp";

/** The panel's Help toggle, remembered per browser (a convenience; storage failures are ignored). */
function useShowHelp(): readonly [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(HELP_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(HELP_KEY, v ? "0" : "1");
      } catch {
        // Blocked storage: the toggle still works for this session.
      }
      return !v;
    });
  return [on, toggle];
}

export function ParamPanel({ layer, resolved, onChange, onCheckpoint, onResetParam, onResetLayer, onViewCode, onEditScript, problem }: Props) {
  const { t } = useLang();
  const ct = useCoreText();
  const [collapsed, toggle] = useCollapsed();
  const [showHelp, toggleHelp] = useShowHelp();
  if (!layer) return <p className="p-3 text-xs text-zinc-500">{t("panel.selectLayer")}</p>;
  const def = layerDef(defaultRegistry, layer);
  if (!def) return <p className="p-3 text-xs text-red-400">{t("panel.unknownModule", { module: layer.module })}</p>;
  const changed = Object.entries(def.params).some(([name, spec]) => !isDefaultSetting(spec, layer.params[name]));
  // A script layer's name and settings are its author's own words; a built-in's follow the studio's language.
  const builtin = layer.module !== SCRIPT_MODULE;
  const heading = builtin ? ct.moduleLabel(def.id, def.label) : def.label;
  return (
    <div className="pb-24 pl-4 pr-3">
      <div className="flex items-baseline justify-between gap-2 pt-3">
        <h2 className="text-sm font-semibold text-zinc-100">{heading}</h2>
        <span className="flex-1" />
        <button
          type="button"
          className={`rounded px-1.5 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 ${showHelp ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"}`}
          aria-pressed={showHelp}
          onClick={toggleHelp}
          title={t("panel.helpHint")}
        >
          {t("panel.help")}
        </button>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
          onClick={() => (layer.module === SCRIPT_MODULE ? onEditScript(layer.id) : onViewCode(def.id, heading, layer.id))}
          title={layer.module === SCRIPT_MODULE ? t("panel.editCodeHint") : t("panel.codeHint")}
        >
          {layer.module === SCRIPT_MODULE ? t("panel.editCode") : t("panel.code")}
        </button>
        {/* aria-disabled, not disabled: the button would drop focus to <body> the moment it disabled itself. */}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent aria-disabled:hover:text-zinc-400"
          aria-disabled={!changed}
          onClick={() => changed && onResetLayer(layer.id)}
          title={changed ? t("panel.resetAllHint") : t("panel.allDefault")}
        >
          {t("panel.resetAll")}
        </button>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-zinc-500">{ct.moduleDescription(def.id, def.description)}</p>
      {problem && (
        <div role="status" className="mb-2 flex flex-col items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-200">
          {problem.message}
          <button type="button" className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-100 hover:bg-amber-500/30" onClick={problem.onFix}>
            {problem.fix}
          </button>
        </div>
      )}
      {groupParams(def.params).flatMap(({ title, names: all }) => {
        // Settings that do nothing in the current mode stay out of the way.
        const names = all.filter((n) => {
          const spec = def.params[n];
          return spec !== undefined && isRelevant(spec, def.params, layer.params);
        });
        if (!names.length) return [];
        const rows = names.map((name) => {
          const spec = def.params[name];
          return (
            spec && (
              <ParamRow
                key={`${layer.id}:${name}`}
                name={name}
                spec={builtin ? ct.spec(layer.module, name, spec) : spec}
                optionLabel={(o) => ct.optionLabel(layer.module, name, o)}
                setting={layer.params[name]}
                resolved={resolved?.values[name]}
                swatches={swatchesFor(layer.module, name)}
                onChange={(s, record) => onChange(layer.id, name, s, record)}
                onCheckpoint={onCheckpoint}
                onReset={() => onResetParam(layer.id, name)}
                showHelp={showHelp}
              />
            )
          );
        });
        if (title === null) return <div key="loose">{rows}</div>;
        const key = `${layer.module}/${title}`;
        const open = !collapsed.has(key);
        const bodyId = `params-${layer.id}-${title.replace(/\W+/g, "-")}`;
        const changedCount = names.filter((n) => {
          const spec = def.params[n];
          return spec && !isDefaultSetting(spec, layer.params[n]);
        }).length;
        return (
          <section key={title} className="mt-1 scroll-mt-2" data-section={ct.group(title)}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => toggle(key)}
            >
              <span className={`transition-transform ${open ? "" : "-rotate-90"}`}>
                <ChevronIcon />
              </span>
              <span className="flex-1">{ct.group(title)}</span>
              {!open && changedCount > 0 && (
                <span className="rounded bg-zinc-800 px-1.5 py-px text-[10px] font-normal normal-case tracking-normal text-sky-300">
                  {t("panel.changed", { n: changedCount })}
                </span>
              )}
            </button>
            <div id={bodyId} hidden={!open}>
              {rows}
            </div>
          </section>
        );
      })}
    </div>
  );
}
