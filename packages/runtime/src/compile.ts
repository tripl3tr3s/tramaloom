/**
 * Turns a script layer's code into a drawing function. Runs only inside the script sandbox
 * (and, later, in a minted piece running its own artist's code), never in the studio's page.
 *
 * A script is plain JavaScript that calls layer() once:
 *
 *   layer({
 *     label: "Rings",
 *     params: { rings: { kind: "int", label: "Rings", min: 1, max: 40, default: 12 } },
 *     apply(scene, v, ctx) {
 *       ...
 *       return addItems(scene, items);
 *     },
 *   });
 *
 * The helpers in scope are the ones the built-in modules use, so a built-in module's code
 * works as a script once its imports and types are gone.
 */
import type { ModuleContext, ParamValue, Scene, ScriptRunner } from "@gridloom/core";
import { addItems } from "../../core/src/scene.ts";
import { COLOR_RULES, colorHelp, colorLookup, extent, pickColor, rampColors } from "../../core/src/modules/color.ts";
import { sampleField } from "../../core/src/modules/trace.ts";
import { chance, int, shuffled } from "../../core/src/prng/distributions.ts";
import { makeNoise2D } from "../../core/src/prng/noise.ts";
import { dcos, dsin, TAU } from "../../core/src/math/trig.ts";
import { PALETTE_NAMES, PALETTES } from "../../core/src/palettes/palettes.ts";

/** Everything a script can use besides plain JavaScript. */
export const SCRIPT_HELPERS = {
  addItems,
  COLOR_RULES,
  colorHelp,
  colorLookup,
  extent,
  pickColor,
  rampColors,
  sampleField,
  chance,
  int,
  shuffled,
  makeNoise2D,
  dcos,
  dsin,
  TAU,
  PALETTE_NAMES,
  PALETTES,
  /** Lets a remixed built-in module keep its defineModule({ ... }) call. */
  defineModule: <T>(def: T): T => def,
} as const;

type Apply = (scene: Scene, v: Readonly<Record<string, ParamValue>>, ctx: Pick<ModuleContext, "rng">) => Scene;

export interface CompiledScript {
  readonly label: string;
  /** As declared; the studio validates them before storing. */
  readonly params: unknown;
  readonly apply: Apply;
}

/** An error in the script, with the line it happened on when the engine says. */
export class ScriptError extends Error {
  readonly line: number | null;
  constructor(message: string, line: number | null = null) {
    super(message);
    this.name = "ScriptError";
    this.line = line;
  }
}

const NAMES = Object.keys(SCRIPT_HELPERS);
const VALUES = Object.values(SCRIPT_HELPERS);
const PRELUDE = '"use strict";\n';
// A frame inside code made by new Function: "<anonymous>:5:3" (V8), "> Function:5:3" (Firefox).
const FRAME = /(?:<anonymous>|> Function):(\d+):\d+/;

/** The engine's line for an error in new Function code, or null. */
function rawLine(err: Error): number | null {
  const m = FRAME.exec(err.stack ?? "");
  if (m) return Number(m[1]);
  // Firefox (syntax errors) and Safari put the position on the error itself.
  const own = (err as { lineNumber?: unknown; line?: unknown }).lineNumber ?? (err as { line?: unknown }).line;
  return typeof own === "number" ? own : null;
}

let offset: number | null = null;
/** How far the engine's line numbers for new Function code are from the script's own lines. */
function lineOffset(): number {
  if (offset !== null) return offset;
  offset = 0;
  try {
    new Function(...NAMES, "layer", `${PRELUDE}throw new Error("probe");`)(...VALUES, () => undefined);
  } catch (err) {
    const raw = err instanceof Error ? rawLine(err) : null;
    if (raw !== null) offset = raw - 1;
  }
  return offset;
}

/** The script line an error points at, or null when the engine does not say. */
function lineOf(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const raw = rawLine(err);
  if (raw === null) return null;
  const line = raw - lineOffset();
  return line >= 1 ? line : null;
}

export const errorOf = (err: unknown): ScriptError =>
  err instanceof ScriptError ? err : new ScriptError(err instanceof Error ? `${err.name === "Error" ? "" : `${err.name}: `}${err.message}` : String(err), lineOf(err));

/** Runs the script's top level and returns what it passed to layer(). */
export function compileScript(code: string): CompiledScript {
  let def: unknown;
  let calls = 0;
  const layer = (d: unknown) => {
    calls += 1;
    def = d;
  };
  try {
    new Function(...NAMES, "layer", PRELUDE + code)(...VALUES, layer);
  } catch (err) {
    throw errorOf(err);
  }
  if (calls === 0) throw new ScriptError("The script must call layer({ ... }) once, with its params and apply");
  if (calls > 1) throw new ScriptError("The script calls layer(...) more than once; one script makes one layer");
  if (typeof def !== "object" || def === null) throw new ScriptError("layer(...) needs an object: layer({ label, params, apply })");
  const d = def as Record<string, unknown>;
  if (typeof d["apply"] !== "function") throw new ScriptError("layer({ ... }) needs an apply(scene, v, ctx) function");
  const label = typeof d["label"] === "string" && d["label"].trim() ? d["label"].trim() : "Script";
  return { label, params: d["params"] ?? {}, apply: d["apply"] as Apply };
}

// Compiled scripts by code, so drawing many seeds compiles each script once.
const cache = new Map<string, CompiledScript>();
const MAX_CACHED = 32;

function compiled(code: string): CompiledScript {
  const hit = cache.get(code);
  if (hit) return hit;
  const c = compileScript(code);
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
  cache.set(code, c);
  return c;
}

/**
 * Draws a script layer. Math.random is the layer's own seeded stream while it runs, so a
 * script that uses it still draws the same picture for the same seed.
 */
export const scriptRunner: ScriptRunner = (script, scene, values, ctx) => {
  const { apply } = compiled(script.code);
  const random = Math.random;
  Math.random = ctx.rng("random");
  try {
    const out = apply(scene, values, { rng: ctx.rng });
    if (typeof out !== "object" || out === null || !Array.isArray((out as Scene).items)) {
      throw new ScriptError("apply(...) must return the scene, for example return addItems(scene, items)");
    }
    return out;
  } catch (err) {
    throw errorOf(err);
  } finally {
    Math.random = random;
  }
};
