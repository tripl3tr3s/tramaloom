/**
 * Builds the mint player in pieces, so an exported page carries only what it uses:
 * - dist/runtime.js: the engine (generation, rendering, traits, the player) with no modules
 * - dist/modules/<id>.js and dist/modules.json: one small script per module; each calls
 *   GridloomRuntime.registerModule, and reads every shared helper from that global.
 * Help text is stripped from both: a minted piece never shows it.
 * Anything that would only break at view time (a helper the engine lacks, a module the
 * registry parse missed, help that survived) fails the build instead.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { Plugin } from "vite";
import { build, normalizePath } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "dist");
const modulesDir = resolve(root, "../core/src/modules");
const registryFile = normalizePath(join(modulesDir, "registry.ts"));
const fail = (msg: string): never => {
  throw new Error(`mint player build: ${msg}`);
};
const clean = (id: string): string => normalizePath(id.split("?")[0] ?? "");

const HELP = /\s*\bhelp:\s*(?:"(?:[^"\\]|\\.)*"|colorHelp\([^)]*\)),?/g;
const stripHelp = (): Plugin => ({
  name: "gridloom-strip-help",
  enforce: "pre",
  transform(code, id) {
    return clean(id).includes("/packages/core/src/modules/") ? { code: code.replace(HELP, ""), map: null } : null;
  },
});

/** The engine registers modules at run time: give it a registry module with none built in. */
const emptyRegistry = (): Plugin => ({
  name: "gridloom-empty-registry",
  enforce: "pre",
  load(id) {
    if (clean(id) !== registryFile) return null;
    return [
      "export const getModule = (registry, id) => (Object.hasOwn(registry, id) ? registry[id] : undefined);",
      // Same as registry.ts: a script layer brings its own label and params.
      "export const layerDef = (registry, layer) => { const def = getModule(registry, layer.module); return def && layer.module === 'script' && layer.script ? { ...def, label: layer.script.label || def.label, params: layer.script.params } : def; };",
      "export const defaultRegistry = {};",
    ].join("\n");
  },
});

const lib = (entry: string, name: string, fileName: string) => ({ entry, formats: ["iife" as const], name, fileName: () => fileName });

// 1. The engine.
await build({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [stripHelp(), emptyRegistry()],
  build: { outDir: dist, emptyOutDir: true, target: "es2020", minify: true, lib: lib(join(root, "src/runtime.ts"), "GridloomRuntime", "runtime.js") },
});

// The script sandbox's worker: the whole engine with every module, plus the script compiler.
// The studio hands it to a sandboxed iframe as text; it never runs in a minted piece.
await build({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [stripHelp()],
  build: { outDir: dist, emptyOutDir: false, target: "es2020", minify: true, lib: lib(join(root, "src/sandbox.ts"), "GridloomSandbox", "sandbox.js") },
});
const sandboxCode = readFileSync(join(dist, "sandbox.js"), "utf8");
if (!sandboxCode.includes("layer(...)")) fail("the sandbox build lost the script compiler");

// What the engine actually exposes, read back from the built file in a sandbox: module
// scripts can use these and nothing else. Loading defines the global and runs nothing.
const engineCode = readFileSync(join(dist, "runtime.js"), "utf8");
const sandbox: Record<string, unknown> = {};
runInNewContext(`${engineCode}\nthis.__exports = Object.keys(GridloomRuntime);`, sandbox);
const exported = new Set(sandbox["__exports"] as string[]);
for (const name of ["registerModule", "start"]) if (!exported.has(name)) fail(`the engine does not export ${name}`);
if (/\bhelp:/.test(engineCode)) fail("help text survived in the engine");

// Files the engine re-exports from: a module may import from these and nothing else.
const runtimeSource = readFileSync(join(root, "src/runtime.ts"), "utf8").replace(/\r\n/g, "\n");
const sharedFiles = new Set(
  [...runtimeSource.matchAll(/^export \{[^}]*\} from "(\.\.\/\.\.\/core\/src\/[^"]+)";$/gm)].map((m) => normalizePath(resolve(root, "src", m[1] as string))),
);

// 2. One script per module, from the registry's own list.
const source = readFileSync(registryFile, "utf8").replace(/\r\n/g, "\n");
const files = new Map([...source.matchAll(/import \{ (\w+) \} from "\.\/(\w+)\.ts";/g)].map((m) => [m[1] as string, m[2] as string]));
const entries = [...source.matchAll(/^\s+(\w+): asDef\((\w+)\),$/gm)].map((m) => {
  const name = m[2] as string;
  const file = files.get(name) ?? fail(`registry entry ${m[1]} has no matching import`);
  return { id: m[1] as string, name, file: normalizePath(join(modulesDir, `${file}.ts`)) };
});
const registered = (source.match(/asDef\(\w+\)/g) ?? []).length;
if (!entries.length || entries.length !== registered) fail(`read ${entries.length} of the ${registered} modules in registry.ts; is an entry formatted unusually?`);

mkdirSync(join(dist, "modules"), { recursive: true });
const tmp = join(root, "node_modules/.gridloom-entries");
mkdirSync(tmp, { recursive: true });
const out: Record<string, string> = {};
try {
  for (const { id, name, file } of entries) {
    // Every helper the module takes from the engine must exist there.
    const imported = [...readFileSync(file, "utf8").matchAll(/^import \{([^}]*)\} from "\.[^"]*";$/gm)].flatMap((m) =>
      (m[1] as string)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    );
    const missing = imported.filter((n) => !exported.has(n));
    if (missing.length) fail(`module ${id} needs ${missing.join(", ")} from the engine; re-export them from src/runtime.ts`);

    const entry = join(tmp, `${id}.ts`);
    writeFileSync(entry, `import { ${name} } from ${JSON.stringify(file)};\nGridloomRuntime.registerModule(${JSON.stringify(id)}, ${name});\n`);
    // Shared core files stay outside the module script and resolve to the engine's global.
    const shared = (): Plugin => ({
      name: "gridloom-shared-from-engine",
      enforce: "pre",
      resolveId(spec, importer) {
        if (!importer || !spec.startsWith(".") || clean(importer) !== file) return null;
        const target = normalizePath(resolve(dirname(file), spec));
        // Anything else would be read from the engine's global and be undefined there.
        if (!sharedFiles.has(target)) fail(`module ${id} imports ${spec}, which the engine does not provide; re-export it from src/runtime.ts`);
        return { id: target, external: true };
      },
    });
    const result = await build({
      configFile: false,
      root,
      logLevel: "warn",
      plugins: [stripHelp(), shared()],
      build: {
        outDir: dist,
        emptyOutDir: false,
        target: "es2020",
        minify: true,
        write: false,
        lib: lib(entry, `GridloomModule_${id}`, `${id}.js`),
        rollupOptions: { output: { globals: () => "GridloomRuntime" } },
      },
    });
    const chunk = (Array.isArray(result) ? result[0] : result) as { output: readonly { type: string; code?: string }[] };
    const code = chunk.output.find((o) => o.type === "chunk")?.code ?? fail(`no output for module ${id}`);
    if (/\bhelp:/.test(code)) fail(`help text survived in module ${id}`);
    writeFileSync(join(dist, "modules", `${id}.js`), code);
    out[id] = code;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
writeFileSync(join(dist, "modules.json"), JSON.stringify(out));

const sizes = Object.entries(out).map(([id, c]) => `${id} ${(c.length / 1024).toFixed(1)}`);
console.log(`engine ${(engineCode.length / 1024).toFixed(1)} KB; sandbox ${(sandboxCode.length / 1024).toFixed(1)} KB; modules (KB): ${sizes.join(", ")}`);
