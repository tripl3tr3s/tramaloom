import { seedFromHash, streamFromSeed } from "./prng/prng.ts";
import type { ParamSetting, ParamValue } from "./params/params.ts";
import { resolveParam } from "./params/params.ts";
import type { Registry } from "./modules/registry.ts";
import { defaultRegistry, getModule } from "./modules/registry.ts";
import type { Scene } from "./scene.ts";
import type { TraitDef } from "./traits.ts";
import { emptyScene } from "./scene.ts";

export interface Layer {
  /** Stable id: it names the layer's random sub-streams. Never reuse or renumber. */
  readonly id: string;
  readonly module: string;
  readonly enabled: boolean;
  readonly params: Readonly<Record<string, ParamSetting>>;
}

/** A piece = an ordered layer stack. The hash is supplied separately: doc + hash = one output. */
export interface ArtDocument {
  readonly version: 1;
  readonly name: string;
  readonly layers: readonly Layer[];
  /** Collector-facing features, computed from the hash before rendering. */
  readonly traits?: readonly TraitDef[];
}

export interface ResolvedLayer {
  readonly id: string;
  readonly module: string;
  readonly values: Readonly<Record<string, ParamValue>>;
}

export interface Output {
  readonly hash: string;
  readonly resolved: readonly ResolvedLayer[];
  readonly scene: Scene;
}

/** Resolve every param of every enabled layer for a hash. No rendering. */
export function resolveDocument(
  doc: ArtDocument,
  hash: string,
  registry: Registry = defaultRegistry,
): readonly ResolvedLayer[] {
  const seed = seedFromHash(hash);
  return doc.layers
    .filter((l) => l.enabled)
    .map((layer) => {
      const def = getModule(registry, layer.module);
      if (!def) throw new Error(`Unknown module "${layer.module}" in layer "${layer.id}"`);
      const values = Object.fromEntries(
        Object.entries(def.params).map(([name, spec]) => [
          name,
          resolveParam(spec, layer.params[name], streamFromSeed(seed, `${layer.id}/param/${name}`)),
        ]),
      );
      return { id: layer.id, module: layer.module, values };
    });
}

export function generate(doc: ArtDocument, hash: string, registry: Registry = defaultRegistry): Output {
  const seed = seedFromHash(hash);
  const resolved = resolveDocument(doc, hash, registry);
  const scene = resolved.reduce<Scene>((acc, layer) => {
    const def = getModule(registry, layer.module);
    if (!def) return acc;
    return def.apply(acc, layer.values, {
      rng: (label) => streamFromSeed(seed, `${layer.id}/draw/${label}`),
    });
  }, emptyScene());
  return { hash, resolved, scene };
}
