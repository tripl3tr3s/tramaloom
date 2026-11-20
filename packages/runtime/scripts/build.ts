/**
 * Builds the mint player in pieces, so an exported page carries only what it uses:
 * - dist/runtime.js: the engine (generation, rendering, traits, the player) with no modules
 * - dist/modules/<id>.js and dist/modules.json: one small script per module; each calls
 *   GridloomRuntime.registerModule, and reads every shared helper from that global.
 * Help text is stripped from both: a minted piece never shows it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "dist");
const modulesDir = resolve(root, "../core/src/modules");
const registryFile = join(modulesDir, "registry.ts");

const HELP = /\s*help:\s*(?:"(?:[^"\\]|\\.)*"|colorHelp\([^)]*\)),?/g;
const stripHelp = (): Plugin => ({
  name: "gridloom-strip-help",
  enforce: "pre",
  transform(code, id) {
    return id.includes("/packages/core/src/modules/") ? { code: code.replace(HELP, ""), map: null } : null;
  },
});

/** The engine registers modules at run time: give it a registry module with none built in. */
const emptyRegistry = (): Plugin => ({
  name: "gridloom-empty-registry",
  enforce: "pre",
  load(id) {
    if (id.split("?")[0] !== registryFile) return null;
    return [
      "export const getModule = (registry, id) => (Object.hasOwn(registry, id) ? registry[id] : undefined);",
      "export const defaultRegistry = {};",
    ].join("\n");
  },
});

const iife = (name: string) => ({ outDir: dist, emptyOutDir: false, target: "es2020", minify: true, lib: { entry: "", formats: ["iife" as const], name } });

// 1. The engine.
await build({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [stripHelp(), emptyRegistry()],
  build: { ...iife("GridloomRuntime"), emptyOutDir: true, lib: { entry: join(root, "src/runtime.ts"), formats: ["iife"], name: "GridloomRuntime", fileName: () => "runtime.js" } },
});

// 2. One script per module, from the registry's own list.
const source = readFileSync(registryFile, "utf8");
const files = new Map([...source.matchAll(/import \{ (\w+) \} from "\.\/(\w+)\.ts";/g)].map((m) => [m[1] as string, m[2] as string]));
const entries = [...source.matchAll(/^\s+(\w+): asDef\((\w+)\),$/gm)].map((m) => ({ id: m[1] as string, name: m[2] as string, file: join(modulesDir, `${files.get(m[2] as string)}.ts`) }));
if (!entries.length) throw new Error("no modules found in registry.ts");

mkdirSync(join(dist, "modules"), { recursive: true });
const out: Record<string, string> = {};
const tmp = join(root, "node_modules/.gridloom-entries");
mkdirSync(tmp, { recursive: true });
for (const { id, name, file } of entries) {
  const entry = join(tmp, `${id}.ts`);
  writeFileSync(entry, `import { ${name} } from ${JSON.stringify(file)};\nGridloomRuntime.registerModule(${JSON.stringify(id)}, ${name});\n`);
  // Shared core files stay outside the module script and resolve to the engine's global.
  const shared = (): Plugin => ({
    name: "gridloom-shared-from-engine",
    enforce: "pre",
    resolveId(spec, importer) {
      if (!importer || !spec.startsWith(".") || importer.split("?")[0] !== file) return null;
      const target = resolve(dirname(file), spec);
      return { id: target, external: true };
    },
  });
  const result = await build({
    configFile: false,
    root,
    logLevel: "warn",
    plugins: [stripHelp(), shared()],
    build: {
      ...iife(`GridloomModule_${id}`),
      write: false,
      lib: { entry, formats: ["iife"], name: `GridloomModule_${id}`, fileName: () => `${id}.js` },
      rollupOptions: { output: { globals: () => "GridloomRuntime" } },
    },
  });
  const chunk = (Array.isArray(result) ? result[0] : result) as { output: readonly { type: string; code?: string }[] };
  const code = chunk.output.find((o) => o.type === "chunk")?.code;
  if (!code) throw new Error(`no output for module ${id}`);
  writeFileSync(join(dist, "modules", `${id}.js`), code);
  out[id] = code;
}
writeFileSync(join(dist, "modules.json"), JSON.stringify(out));

const engine = readFileSync(join(dist, "runtime.js"), "utf8").length;
const sizes = Object.entries(out).map(([id, c]) => `${id} ${(c.length / 1024).toFixed(1)}`);
console.log(`engine ${(engine / 1024).toFixed(1)} KB; modules (KB): ${sizes.join(", ")}`);
