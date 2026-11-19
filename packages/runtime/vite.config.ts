import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// One IIFE file with core inlined: it is pasted into the exported index.html.
export default defineConfig({
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
