/**
 * The source of each built-in module, exactly as written (TypeScript, with its comments and
 * help text), for reading in the studio. Each file is its own small chunk, fetched on demand.
 * A module's file is named after its id: `cellFill` lives in modules/cellFill.ts.
 */
const sources = import.meta.glob<string>("../../../../../packages/core/src/modules/*.ts", { query: "?raw", import: "default" });

const byId: ReadonlyMap<string, () => Promise<string>> = new Map(
  Object.entries(sources).flatMap(([path, load]) => {
    const id = /\/(\w+)\.ts$/.exec(path)?.[1];
    return id ? [[id, load] as const] : [];
  }),
);

/** The module's source, or null when no file carries that id. */
export async function loadModuleSource(id: string): Promise<string | null> {
  const load = byId.get(id);
  return load ? load() : null;
}
