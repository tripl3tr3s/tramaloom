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
 * the same probability, placed before the child's Symmetry and Post. Pure: one draw per param and per unpaired layer, each
 * from its own labelled stream, so a gene's fate never depends on the others.
 */
/**
 * Symmetry and Post finish the picture, so they stay last: new drawing layers go
 * in before the child's trailing Symmetry and Post. A partner's Symmetry or Post
 * takes that end slot only when it is empty; otherwise it joins the drawing layers.
 */
function place(crossed: readonly Layer[], extras: readonly Layer[]): readonly Layer[] {
  let t = crossed.length;
  if (crossed[t - 1]?.module === "post") t--;
  if (crossed[t - 1]?.module === "symmetry") t--;
  const tail = crossed.slice(t);
  const hasTail = (m: string) => tail.some((l) => l.module === m);
  const sym = hasTail("symmetry") ? undefined : extras.find((l) => l.module === "symmetry");
  const post = hasTail("post") ? undefined : extras.find((l) => l.module === "post");
  const middle = extras.filter((l) => l !== sym && l !== post);
  const ownSym = tail.filter((l) => l.module === "symmetry");
  const ownPost = tail.filter((l) => l.module === "post");
  return [...crossed.slice(0, t), ...middle, ...ownSym, ...(sym ? [sym] : []), ...ownPost, ...(post ? [post] : [])];
}

export function breedDocuments(
  a: ArtDocument,
  b: ArtDocument,
  rngFor: (label: string) => Rng,
  opts: BreedOptions = {},
  registry: Registry = defaultRegistry,
): ArtDocument {
  const share = Math.min(1, Math.max(0, opts.share ?? 0.5));
  // Pairing: exact id + module matches first, for every layer, so a fallback never takes
  // a layer that another layer matches exactly; then same-module fallbacks in stack order.
  const exact = new Map(a.layers.flatMap((l) => {
    const m = b.layers.find((x) => x.id === l.id && x.module === l.module);
    return m ? [[l.id, m] as const] : [];
  }));
  const used = new Set<string>([...exact.values()].map((x) => x.id));
  const pairs = new Map(exact);
  for (const l of a.layers) {
    if (pairs.has(l.id)) continue;
    const m = b.layers.find((x) => x.module === l.module && !used.has(x.id));
    if (m) {
      pairs.set(l.id, m);
      used.add(m.id);
    }
  }

  const crossed = a.layers.map((layer): Layer => {
    const partner = pairs.get(layer.id);
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
  return { ...a, layers: place(crossed, extras.slice(0, room)) };
}
