import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtDocument, Layer } from "@tramaloom/core";
import { builtinPresets, defaultRegistry, generate, setScriptRunner, starterDocument, stepHash } from "@tramaloom/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Test-only: the studio page itself never imports the compiler.
import { compileScript, scriptRunner } from "../../../packages/runtime/src/compile.ts";
import { MAX_SCRIPT_CHARS } from "../src/state/limits.ts";
import { parseScriptParams } from "../src/state/schema.ts";
import { remixSource } from "../src/ui/code/remix.ts";
import { REMIXABLE } from "../src/ui/code/remixLayer.ts";

const dir = join(import.meta.dirname, "../../../packages/core/src/modules");
const source = (id: string) => readFileSync(join(dir, `${id}.ts`), "utf8");

/** A document that uses the module: a preset that has it, else the starter with it added. */
function docWith(id: string): ArtDocument {
  const preset = builtinPresets.find((p) => p.doc.layers.some((l) => l.module === id && l.enabled));
  if (preset) return preset.doc;
  return { ...starterDocument, layers: [...starterDocument.layers, { id: `m_${id}`, module: id, enabled: true, params: {} }] };
}

beforeAll(() => setScriptRunner(scriptRunner));
afterAll(() => setScriptRunner(null));

describe("remixSource", () => {
  // Every module but Canvas and Script converts cleanly, though only drawing layers offer Remix.
  const ALL = Object.keys(defaultRegistry).filter((id) => id !== "canvas" && id !== "script");

  it("offers Remix on drawing layers, never on the pinned setup and finishing layers", () => {
    for (const id of REMIXABLE) expect(ALL).toContain(id);
    for (const id of ["canvas", "grid", "palette", "symmetry", "post", "script"]) expect(REMIXABLE.has(id)).toBe(false);
  });

  for (const id of ALL) {
    it(`${id}: compiles, declares the same params, and draws exactly like the original`, () => {
      const def = defaultRegistry[id];
      if (!def) throw new Error(id);
      const code = remixSource(source(id), id, def.label);
      expect(code.length).toBeLessThanOrEqual(MAX_SCRIPT_CHARS);
      expect(code).not.toMatch(/^import /m);
      const compiled = compileScript(code);
      expect(compiled.label).toBe(`${def.label} remix`.slice(0, 40));
      const params = JSON.parse(JSON.stringify(def.params));
      expect(JSON.parse(JSON.stringify(compiled.params))).toEqual(params);
      expect(parseScriptParams(compiled.params).ok).toBe(true);

      const doc = docWith(id);
      const remixed: ArtDocument = {
        ...doc,
        layers: doc.layers.map((l): Layer => (l.module === id ? { ...l, module: "script", script: { api: 1, label: compiled.label, code, params } } : l)),
      };
      let hash = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
      for (let i = 0; i < 3; i++) {
        expect(generate(remixed, hash).scene.items, `${id} seed ${i}`).toEqual(generate(doc, hash).scene.items);
        hash = stepHash(hash, 1);
      }
    });
  }

  it("keeps comments and lines as written", () => {
    const code = remixSource(source("cellFill"), "cellFill", "Cell fill");
    expect(code).toContain("// Exactly one draw per cell regardless of source keeps streams aligned.");
    expect(code).toContain("const colorFor = (cx, cy) => {");
    expect(code).toContain('label: "Cell fill remix"');
  });

  it("removes optional parameter marks and non-null assertions", () => {
    const src = `import { addItems } from "../scene.ts";
function size(a: number, b?: number): number {
  const box = { w: a } as { w: number } | null;
  return box!.w + (b ?? 0);
}
export const demoModule = defineModule({
  id: "demo",
  label: "Demo",
  params: {},
  apply(scene, v, ctx) {
    return addItems(scene, [{ type: "circle", cx: 0.5, cy: 0.5, r: size(0.1), fill: "#000000" }]);
  },
});
`;
    const code = remixSource(src, "demo", "Demo");
    expect(code).toContain("function size(a, b) {");
    expect(code).toContain("return box.w + (b ?? 0);");
    expect(() => compileScript(code)).not.toThrow();
  });
});
