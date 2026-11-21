/**
 * Script layers: a layer whose drawing is the user's own code.
 *
 * The engine never runs that code itself. A script layer's params are stored in the document
 * as data, so everything that only needs settings (the settings panel, traits, census,
 * mutation, breeding) works without running anything. Drawing calls the runner installed with
 * setScriptRunner, and only an isolated sandbox installs one (or a minted piece, which runs its
 * own artist's code). Without a runner, drawing a script layer throws.
 */
import type { ParamSpecs, ParamValue } from "./params/params.ts";
import type { Scene } from "./scene.ts";
import type { ModuleContext } from "./modules/types.ts";

/** Module id of script layers. */
export const SCRIPT_MODULE = "script";

/** Version of the helpers and rules a script is written against. Stored with every script. */
export const SCRIPT_API = 1;

export interface LayerScript {
  readonly api: number;
  /** Name shown in the layer stack. */
  readonly label: string;
  readonly code: string;
  /** The params the code declares, as data: read without running the code. */
  readonly params: ParamSpecs;
}

export type ScriptRunner = (script: LayerScript, scene: Scene, values: Readonly<Record<string, ParamValue>>, ctx: ModuleContext) => Scene;

let runner: ScriptRunner | null = null;

/** Installs (or with null removes) the function that runs script layers. Sandbox only. */
export function setScriptRunner(next: ScriptRunner | null): void {
  runner = next;
}

/** Runs a script layer through the installed runner. */
export function runScript(script: LayerScript, scene: Scene, values: Readonly<Record<string, ParamValue>>, ctx: ModuleContext): Scene {
  if (!runner) throw new Error("Script layers can only be drawn inside the script sandbox");
  return runner(script, scene, values, ctx);
}

/** The document has at least one enabled script layer, so drawing it needs the sandbox. */
export const hasScripts = (doc: { readonly layers: readonly { readonly module: string; readonly enabled: boolean }[] }): boolean =>
  doc.layers.some((l) => l.enabled && l.module === SCRIPT_MODULE);
