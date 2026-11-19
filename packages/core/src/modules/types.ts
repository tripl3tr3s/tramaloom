import type { Rng } from "../prng/prng.ts";
import type { ParamSpecs, ValuesOf } from "../params/params.ts";
import type { Scene } from "../scene.ts";

export interface ModuleContext {
  /** Named sub-stream scoped to this layer. */
  readonly rng: (label: string) => Rng;
}

export interface ModuleDef<P extends ParamSpecs = ParamSpecs> {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly params: P;
  apply(scene: Scene, values: ValuesOf<P>, ctx: ModuleContext): Scene;
}

/** Identity helper that preserves the literal param types for `apply`. */
export const defineModule = <const P extends ParamSpecs>(def: ModuleDef<P>): ModuleDef<P> => def;
