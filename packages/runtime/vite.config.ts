import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * Param help text is for the studio's settings panel; a minted piece never shows it,
 * and on-chain storage charges for every byte. Drop `help: "..."` and
 * `help: colorHelp(...)` from the core modules as they are bundled. Generation never
 * reads help, so the drawing is unaffected (the mint e2e test compares it byte for byte).
 */
const HELP = /\s*help:\s*(?:"(?:[^"\\]|\\.)*"|colorHelp\([^)]*\)),?/g;
const stripHelp = (): Plugin => ({
  name: "gridloom-strip-help",
  enforce: "pre",
  transform(code, id) {
    if (!id.includes("/packages/core/src/modules/")) return null;
    return { code: code.replace(HELP, ""), map: null };
  },
});

// One IIFE file with core inlined: it is pasted into the exported index.html.
export default defineConfig({
  plugins: [stripHelp()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    minify: true,
    lib: {
      entry: fileURLToPath(new URL("./src/runtime.ts", import.meta.url)),
      formats: ["iife"],
      name: "GridloomRuntime",
      fileName: () => "runtime.js",
    },
  },
});
