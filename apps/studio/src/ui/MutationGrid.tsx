import type { ArtDocument } from "@tramaloom/core";
import { breedDocuments, builtinPresets, mutateDocument, stepHash, stream } from "@tramaloom/core";
import { useEffect, useMemo, useState } from "react";
import { isTypingTarget, useDialog } from "../hooks/useDialog.ts";
import type { ThumbJob } from "../render/protocol.ts";
import { listPresets } from "../state/library.ts";
import { MAX_LAYERS } from "../state/limits.ts";
import { useThumbnails } from "../render/useThumbnails.ts";
import { randomHash } from "../state/store.ts";
import type { CoreText } from "../i18n/coreText.ts";
import { useCoreText } from "../i18n/coreText.ts";
import { useLang } from "../i18n/i18n.tsx";

interface Props {
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly selectedId: string | null;
  readonly onAdopt: (doc: ArtDocument, hash: string) => void;
  readonly onClose: () => void;
}

const CENTER = 4;

interface Partner {
  readonly key: string;
  readonly name: string;
  readonly doc: ArtDocument;
  readonly hash: string;
}

const builtinPartners = (ct: CoreText): readonly Partner[] =>
  builtinPresets.map((p) => ({ key: `builtin:${p.id}`, name: ct.presetName(p.id, p.doc.name), doc: p.doc, hash: p.hash }));
const THUMB = 360;

/** Names of the settings that differ, as "layer.param", for the tile tooltip. */
function changes(a: ArtDocument, b: ArtDocument): string[] {
  return b.layers.flatMap((l) => {
    const before = a.layers.find((x) => x.id === l.id);
    return Object.keys(l.params)
      .filter((k) => JSON.stringify(l.params[k]) !== JSON.stringify(before?.params[k]))
      .map((k) => `${l.id}.${k}`);
  });
}

/**
 * Apophysis-style mutation grid: the current piece in the middle, eight
 * variations around it. Picking one makes it the new centre, so you can walk
 * through the space of a piece by clicking.
 */
export function MutationGrid({ doc, hash, selectedId, onAdopt, onClose }: Props) {
  const { t } = useLang();
  const ct = useCoreText();
  const [amount, setAmount] = useState(0.35);
  // The slider updates instantly; the expensive grid follows once it settles.
  const [settled, setSettled] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setSettled(amount), 120);
    return () => clearTimeout(t);
  }, [amount]);
  const [scope, setScope] = useState<"all" | "layer">("all");
  // Breed: cross the piece with a partner preset instead of nudging it.
  const [mode, setMode] = useState<"mutate" | "breed">("mutate");
  const [share, setShare] = useState(0.5);
  const [settledShare, setSettledShare] = useState(share);
  useEffect(() => {
    const t = setTimeout(() => setSettledShare(share), 120);
    return () => clearTimeout(t);
  }, [share]);
  const [userPartners, setUserPartners] = useState<readonly Partner[]>([]);
  useEffect(() => {
    let live = true;
    listPresets().then(
      (ps) => live && setUserPartners(ps.map((p) => ({ key: `user:${p.id}`, name: p.name, doc: p.doc, hash: p.hash }))),
      () => undefined, // No library in this browser: the built-ins are enough.
    );
    return () => {
      live = false;
    };
  }, []);
  const BUILTIN_PARTNERS = useMemo(() => builtinPartners(ct), [ct]);
  const partners = useMemo(() => [...userPartners, ...BUILTIN_PARTNERS], [userPartners, BUILTIN_PARTNERS]);
  const [partnerKey, setPartnerKey] = useState<string>(BUILTIN_PARTNERS[1]?.key ?? BUILTIN_PARTNERS[0]?.key ?? "");
  const partner = partners.find((p) => p.key === partnerKey) ?? partners[0];
  const [reseed, setReseed] = useState(false);
  const [seed, setSeed] = useState(randomHash);

  const tiles = useMemo((): readonly ThumbJob[] => {
    if (mode === "breed" && partner) {
      const children = Array.from({ length: 8 }, (_, i): ThumbJob => ({
        doc: breedDocuments(doc, partner.doc, (label) => stream(seed, `b${i}/${label}`), { share: settledShare, maxLayers: MAX_LAYERS }),
        // The seed is a gene too: inherited from the partner as often as its settings are.
        hash: reseed ? stepHash(seed, i + 1) : stream(seed, `b${i}/hash`)() < settledShare ? partner.hash : hash,
      }));
      return [...children.slice(0, CENTER), { doc, hash }, ...children.slice(CENTER)];
    }
    const layerScope = scope === "layer" && selectedId ? [selectedId] : undefined;
    const variants = Array.from({ length: 8 }, (_, i): ThumbJob => ({
      doc: mutateDocument(doc, (label) => stream(seed, `m${i}/${label}`), {
        amount: settled,
        ...(layerScope ? { layers: layerScope } : {}),
      }),
      hash: reseed ? stepHash(seed, i + 1) : hash,
    }));
    return [...variants.slice(0, CENTER), { doc, hash }, ...variants.slice(CENTER)];
  }, [doc, hash, seed, settled, scope, selectedId, reseed, mode, partner, settledShare]);
  const { urls, fresh, busy, error } = useThumbnails(tiles, THUMB);

  const pick = (i: number) => {
    const tile = tiles[i];
    // Only adopt what is on screen: while a new batch renders the old images are stale.
    if (!tile || !fresh || amount !== settled || share !== settledShare) return;
    if (i === CENTER) return onClose();
    onAdopt(tile.doc, tile.hash);
    setSeed(randomHash());
  };

  const dialogRef = useDialog<HTMLDivElement>((e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      return onClose();
    }
    if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    // Space and Enter keep their normal meaning on buttons and controls.
    const onControl = e.target instanceof HTMLElement && e.target.matches("button, input, select");
    if (k === "m") onClose();
    else if (k === "r" || (k === " " && !onControl)) setSeed(randomHash());
    else if (/^[1-9]$/.test(k)) pick(Number(k) - 1);
    else return;
    e.preventDefault();
  });
  const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="absolute inset-0 z-30 flex flex-col items-center gap-3 overflow-auto bg-zinc-950 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t("mutation.title")}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <div role="group" aria-label={t("mutation.mode")} className="flex rounded bg-zinc-900 p-0.5">
          {(["mutate", "breed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={(e) => {
                setMode(m);
                blur(e);
              }}
              className={`rounded px-2 py-0.5 capitalize ${mode === m ? "bg-zinc-200 font-semibold text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {t(m === "mutate" ? "mutation.mutate" : "mutation.breed")}
            </button>
          ))}
        </div>
        {mode === "breed" && (
          <>
            <select
              className="max-w-44 rounded bg-zinc-800 px-1 py-0.5"
              value={partner?.key ?? ""}
              onChange={(e) => {
                setPartnerKey(e.target.value);
                e.currentTarget.blur();
              }}
              aria-label={t("mutation.partner")}
            >
              {userPartners.length > 0 && (
                <optgroup label={t("library.yours")}>
                  {userPartners.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t("mutation.builtIn")}>
                {BUILTIN_PARTNERS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <label className="flex items-center gap-2" title={t("mutation.shareHint")}>
              {t("mutation.share")}
              <input type="range" min={0.05} max={0.95} step={0.05} value={share} onChange={(e) => setShare(Number(e.target.value))} onPointerUp={blur} aria-label={t("mutation.share")} />
              <span className="w-8 tabular-nums">{share.toFixed(2)}</span>
            </label>
          </>
        )}
        <label className={`flex items-center gap-2 ${mode === "breed" ? "hidden" : ""}`}>
          {t("mutation.amount")}
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            onPointerUp={blur}
            aria-label={t("mutation.amountLabel")}
          />
          <span className="w-8 tabular-nums">{amount.toFixed(2)}</span>
        </label>
        <select
          className={`rounded bg-zinc-800 px-1 py-0.5 ${mode === "breed" ? "hidden" : ""}`}
          value={scope}
          onChange={(e) => {
            setScope(e.target.value === "layer" ? "layer" : "all");
            e.currentTarget.blur();
          }}
          aria-label={t("mutation.scope")}
        >
          <option value="all">{t("mutation.all")}</option>
          <option value="layer" disabled={!selectedId}>
            {t("mutation.selected")}
          </option>
        </select>
        <label className="flex items-center gap-1" title={t("mutation.reseedHint")}>
          <input
            type="checkbox"
            checked={reseed}
            onChange={(e) => {
              setReseed(e.target.checked);
              e.currentTarget.blur();
            }}
          />
          {t("mutation.reseed")}
        </label>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={() => setSeed(randomHash())}>
          {t("mutation.shuffle")}
        </button>
        <button type="button" className="rounded bg-zinc-800 px-2 py-0.5 hover:bg-zinc-700" onClick={onClose}>
          {t("common.doneEsc")}
        </button>
        <span className="min-w-16 text-zinc-500" aria-live="polite">
          {error ?? (busy ? t("mutation.rendering") : "")}
        </span>
      </div>
      <div className="grid w-full max-w-[min(56rem,calc((100dvh-10rem)*0.75))] grid-cols-3 gap-3">
        {tiles.map((tile, i) => {
          const diff = i === CENTER ? [] : changes(doc, tile.doc);
          const title =
            i === CENTER
              ? t("mutation.current")
              : diff.length
                ? `${i + 1}: ${diff.slice(0, 6).join(", ")}${diff.length > 6 ? ` +${diff.length - 6}` : ""}`
                : t(tile.hash !== hash ? "mutation.sameNewSeed" : "mutation.same", { n: i + 1 });
          return (
            <button
              type="button"
              key={i}
              onClick={() => pick(i)}
              title={title}
              aria-disabled={!fresh}
              className={`group relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg bg-zinc-900 ring-1 transition hover:ring-2 hover:ring-sky-500 ${
                i === CENTER ? "ring-2 ring-zinc-400" : "ring-zinc-800"
              } ${fresh ? "" : "opacity-40"}`}
            >
              {urls[i] ? (
                <img src={urls[i] ?? undefined} alt={title} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-zinc-600">...</span>
              )}
              <span className="absolute left-1.5 top-1 rounded bg-black/60 px-1 font-mono text-[10px] text-zinc-300">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500">
        {mode === "breed"
          ? t("mutation.breedHelp", { partner: partner?.name ?? t("mutation.thePartner") })
          : t("mutation.help")}
      </p>
    </div>
  );
}
