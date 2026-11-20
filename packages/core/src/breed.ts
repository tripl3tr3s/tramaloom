import type { ArtDocument, Layer } from "./document.ts";
import type { Registry } from "./modules/registry.ts";
import { defaultRegistry, getModule } from "./modules/registry.ts";
import type { Rng } from "./prng/prng.ts";

export interface BreedOptions {
  /** Chance that each gene comes from the partner, 0..1. Default 0.5. */
  readonly share?: number;
  /** Upper bound on the child's layer count; extra partner layers are dropped first. */
  readonly maxLayers?: number;
}

/**
 * Cross two documents (uniform crossover). The child keeps `a`'s layer order,
 * name and traits. Each layer of `a` is paired with a layer of `b` (same id and
 * module first, else the first unused layer of the same module), and every
 * param of a pair comes from `b` with probability `share`, a missing setting
 * meaning the module default; settings locked in `a` always stay. Layers of `b` with no pair join at the end with
 * the same probability. Pure: one draw per param and per unpaired layer, each
 * from its own labelled stream, so a gene's fate never depends on the others.
 */
export function breedDocuments(
  a: ArtDocument,
  b: ArtDocument,
  rngFor: (label: string) => Rng,
  opts: BreedOptions = {},
  registry: Registry = defaultRegistry,
): ArtDocument {
  const share = Math.min(1, Math.max(0, opts.share ?? 0.5));
  const used = new Set<string>();
  const partnerOf = (l: Layer): Layer | undefined => {
    const exact = b.layers.find((x) => x.id === l.id && x.module === l.module && !used.has(x.id));
    const found = exact ?? b.layers.find((x) => x.module === l.module && !used.has(x.id));
    if (found) used.add(found.id);
    return found;
  };

  const crossed = a.layers.map((layer): Layer => {
    const partner = partnerOf(layer);
    const def = getModule(registry, layer.module);
    if (!partner || !def) return layer;
    const names = Object.keys(def.params);
    const params = Object.fromEntries(
      [...new Set([...Object.keys(layer.params), ...names])].flatMap((name) => {
        // The draw is taken even for locked settings, so locking one never shifts another's fate.
        const drawn = names.includes(name) && rngFor(`${layer.id}/${name}`)() < share;
        const fromPartner = drawn && layer.params[name]?.locked !== true;
        const setting = fromPartner ? partner.params[name] : layer.params[name];
        return setting === undefined ? [] : [[name, setting] as const];
      }),
    );
    return { ...layer, params };
  });

  const ids = new Set(crossed.map((l) => l.id));
  const fresh = (id: string): string => {
    let n = 2;
    while (ids.has(`${id}-${n}`)) n++;
    return `${id}-${n}`;
  };
  const extras = b.layers
    .filter((l) => !used.has(l.id) && l.module !== "canvas")
    .flatMap((l): Layer[] => {
      // The draw happens for every unpaired layer, taken or not, so later layers keep their streams.
      const take = rngFor(`extra/${l.id}`)() < share;
      if (!take) return [];
      const id = ids.has(l.id) ? fresh(l.id) : l.id;
      ids.add(id);
      return [{ ...l, id }];
    });
  const room = Math.max(0, (opts.maxLayers ?? Infinity) - crossed.length);
  return { ...a, layers: [...crossed, ...extras.slice(0, room)] };
}
