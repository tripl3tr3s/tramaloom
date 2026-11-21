/**
 * Player for an exported piece. Self-hosted contract (genart):
 * - seed from ?hash= (or #hash=), 64 hex with optional 0x; none = random, written back to the URL
 * - optional ?width=&height= freeze the pixel size; otherwise the piece fits the window
 * - window.$features: flat traits object, from the hash alone, set before rendering
 * - window.render(hash): pure entry point; window.rendered + "genart:done" when the frame is complete
 * No network: everything this needs is in the page.
 *
 * Built as an engine without modules. An exported page loads this, then one small
 * script per module the piece uses (each calls registerModule), then calls start().
 * The helpers below are exported so those module scripts can share them.
 */
import type { ArtDocument, ModuleDef, Registry, Traits } from "@gridloom/core";
import type { Scene } from "@gridloom/core";
import { computeTraits, drawScene, ENGINE_VERSION, generate, toSVG } from "@gridloom/core";

// Shared helpers the module scripts import (their imports become GridloomRuntime.<name>).
export { addItems } from "../../core/src/scene.ts";
export { COLOR_RULES, colorHelp, colorLookup, extent, pickColor, rampColors } from "../../core/src/modules/color.ts";
export { defineModule } from "../../core/src/modules/types.ts";
export { sampleField } from "../../core/src/modules/trace.ts";
export { chance, int, shuffled } from "../../core/src/prng/distributions.ts";
export { makeNoise2D } from "../../core/src/prng/noise.ts";
export { dcos, dsin, TAU } from "../../core/src/math/trig.ts";
export { runScript, setScriptRunner } from "../../core/src/script.ts";
export { PALETTE_NAMES, PALETTES } from "../../core/src/palettes/palettes.ts";

/** The modules this page's script tags registered: exactly the ones the piece uses. */
const modules: Record<string, ModuleDef> = {};
const registry: Registry = modules;

export function registerModule(id: string, def: ModuleDef): void {
  modules[id] = def;
}

interface GridloomApi {
  readonly engine: number;
  readonly doc: ArtDocument;
  hash: string;
  /** The current piece as SVG (same display list as the canvas). */
  svg(): string;
}

declare global {
  interface Window {
    $features?: Traits;
    rendered?: HTMLCanvasElement;
    render?: (hash: string) => void;
    gridloom?: GridloomApi;
    gridloomError?: string;
  }
}

// Sizes every current browser can draw (iOS Safari is the tightest).
const MAX_SIDE = 8192;
const MAX_AREA = 16_777_216;

/** Exactly 64 hex characters, optional 0x. Anything else is rejected, never padded or cut. */
export function parseHash(input: string): string | null {
  const m = /^(?:0x)?([0-9a-f]{64})$/i.exec(input.trim());
  return m?.[1] ? m[1].toLowerCase() : null;
}

function readDoc(): ArtDocument {
  const el = document.getElementById("gridloom-document");
  if (!el?.textContent) throw new Error("missing document");
  return JSON.parse(el.textContent) as ArtDocument;
}

function randomHash(): string {
  // Choosing which piece to look at is the one legitimate unseeded random; drawing never is.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Query first, then fragment (blob: URLs cannot carry a query). Empty counts as absent. */
function param(name: string): string | null {
  const q = new URLSearchParams(location.search).get(name);
  if (q) return q;
  return new URLSearchParams(location.hash.replace(/^#/, "")).get(name) || null;
}

function sizeParam(name: string): number | null {
  const v = param(name);
  if (v === null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_SIDE, n) : null;
}

function fail(msg: string): void {
  window.gridloomError = msg;
  document.dispatchEvent(new CustomEvent("genart:error", { detail: { message: msg } }));
  showError(msg);
}

function showError(msg: string): void {
  document.body.textContent = "";
  const p = document.createElement("p");
  p.textContent = msg;
  p.style.cssText = "font:14px system-ui,sans-serif;color:#eee;padding:24px";
  document.body.append(p);
}

function main(): void {
  const doc = readDoc();
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", doc.name);
  document.body.append(canvas);
  const fixedW = sizeParam("width");
  const fixedH = sizeParam("height");

  const api: GridloomApi = {
    engine: ENGINE_VERSION,
    doc,
    hash: "",
    svg: () => (current ? toSVG(current.scene) : ""),
  };
  window.gridloom = api;

  let current: { hash: string; scene: Scene } | null = null;

  const draw = (scene: Scene): void => {
    const dpr = window.devicePixelRatio || 1;
    const boxW = fixedW ?? Math.max(1, Math.floor(window.innerWidth * dpr));
    const boxH = fixedH ?? Math.max(1, Math.floor(window.innerHeight * dpr));
    // One fixed side: the other follows the piece's aspect. Both or neither: fit inside the box.
    const s =
      fixedW !== null && fixedH === null
        ? fixedW / scene.width
        : fixedH !== null && fixedW === null
          ? fixedH / scene.height
          : Math.min(boxW / scene.width, boxH / scene.height);
    // Clamp to what browsers can allocate: a too-large canvas silently draws nothing.
    const fit = Math.min(1, MAX_SIDE / (scene.width * s), MAX_SIDE / (scene.height * s), Math.sqrt(MAX_AREA / (scene.width * s * scene.height * s)));
    const w = Math.max(1, Math.floor(scene.width * s * fit));
    const h = Math.max(1, Math.floor(scene.height * s * fit));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w / (fixedW || fixedH ? 1 : dpr)}px`;
    canvas.style.height = `${h / (fixedW || fixedH ? 1 : dpr)}px`;
    document.body.style.background = scene.background;
    // A fixed size can exceed the window: let it scroll instead of clipping.
    if (fixedW !== null || fixedH !== null) document.body.style.overflow = "auto";
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    drawScene(ctx, scene, w, h);
    window.rendered = canvas;
  };

  /** Throws on an invalid hash; the page's own startup reports errors instead. */
  const render = (input: string): void => {
    const hash = parseHash(input);
    if (!hash) throw new Error("hash must be 64 hex characters (optionally 0x-prefixed)");
    api.hash = hash;
    // Features first, from the hash alone; never from what gets drawn.
    window.$features = computeTraits(doc, hash, registry);
    const { scene } = generate(doc, hash, registry);
    current = { hash, scene };
    draw(scene);
    document.dispatchEvent(new CustomEvent("genart:done", { detail: { hash, features: window.$features } }));
  };
  window.render = render;

  let hash = param("hash");
  if (hash !== null && !parseHash(hash)) {
    fail(`Invalid seed "${hash.slice(0, 80)}": expected 64 hex characters.`);
    return;
  }
  if (hash === null) {
    hash = randomHash();
    // Every output is a reproducible link.
    const url = new URL(location.href);
    url.searchParams.set("hash", hash);
    try {
      history.replaceState(null, "", url);
    } catch {
      // file:// or sandboxed frames may refuse; the piece still renders.
    }
  }
  try {
    render(hash);
  } catch (e) {
    fail(`Cannot render this piece: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  // The display list is resolution-independent, so a resize only redraws the
  // cached scene: same piece, no new features, no second done signal.
  if (fixedW === null && fixedH === null) {
    let t: ReturnType<typeof setTimeout> | undefined;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => current && draw(current.scene), 150);
    });
  }
}

/** Called by the page once every module script has registered. */
export function start(): void {
  try {
    main();
  } catch (e) {
    fail(`Cannot start this piece: ${e instanceof Error ? e.message : String(e)}`);
  }
}
