import type { ArtDocument, LayerScript } from "@gridloom/core";
import { generate, setScriptRunner, starterDocument } from "@gridloom/core";
import { afterEach, describe, expect, it } from "vitest";
import { compileScript, scriptRunner, ScriptError } from "../src/compile.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

const RINGS = `layer({
  label: "Rings",
  params: {
    rings: { kind: "int", label: "Rings", help: "How many rings", min: 1, max: 20, default: 4 },
  },
  apply(scene, v, ctx) {
    const items = [];
    for (let i = 1; i <= v.rings; i++) {
      items.push({ type: "circle", cx: 0.5 + dcos(TAU * Math.random()) * 0.01, cy: 0.5, r: i / (2 * v.rings) * 0.45, stroke: "#222222", strokeWidth: 0.002 });
    }
    return addItems(scene, items);
  },
});`;

const asScript = (code: string, params: LayerScript["params"] = {}): LayerScript => ({ api: 1, label: "Test", code, params });
const docWith = (script: LayerScript, params = {}): ArtDocument => ({
  ...starterDocument,
  layers: [...starterDocument.layers, { id: "mine", module: "script", enabled: true, params, script }],
});

afterEach(() => setScriptRunner(null));

const failure = (code: string): ScriptError => {
  try {
    compileScript(code);
  } catch (err) {
    if (err instanceof ScriptError) return err;
    throw err;
  }
  throw new Error("expected the script to fail");
};

describe("compileScript", () => {
  it("returns the label, params and apply the script declares", () => {
    const c = compileScript(RINGS);
    expect(c.label).toBe("Rings");
    expect(c.params).toEqual({ rings: { kind: "int", label: "Rings", help: "How many rings", min: 1, max: 20, default: 4 } });
    expect(typeof c.apply).toBe("function");
  });

  it("explains what is missing", () => {
    expect(failure("const x = 1;").message).toMatch(/must call layer/);
    expect(failure("layer({ apply() {} }); layer({ apply() {} });").message).toMatch(/more than once/);
    expect(failure("layer(3)").message).toMatch(/needs an object/);
    expect(failure("layer({ params: {} })").message).toMatch(/apply/);
  });

  it("reports syntax and runtime errors, with the script's own line when the engine gives one", () => {
    expect(failure("layer({ apply( })").message).toMatch(/SyntaxError/);
    const err = failure("const a = 1;\nconst b = 2;\nnotDefined();\n");
    expect(err.message).toMatch(/notDefined/);
    expect(err.line).toBe(3);
  });

  it("runs in strict mode with only the helpers in scope", () => {
    expect(failure("undeclared = 1; layer({ apply() {} })").message).toMatch(/undeclared/);
    const c = compileScript("layer({ apply(s) { return s; }, label: typeof addItems + typeof dsin + typeof require });");
    expect(c.label).toBe("functionfunctionundefined");
  });
});

describe("scriptRunner", () => {
  it("draws a script layer, the same way for the same seed, with Math.random seeded", () => {
    setScriptRunner(scriptRunner);
    const doc = docWith(asScript(RINGS, compileScript(RINGS).params as LayerScript["params"]), { rings: { value: 6 } });
    const a = generate(doc, H).scene.items;
    const b = generate(doc, H).scene.items;
    const base = generate(starterDocument, H).scene.items.length;
    expect(a.length).toBe(base + 6);
    expect(a).toEqual(b);
    const other = generate(doc, "1".repeat(64)).scene.items.slice(-6);
    expect(other).not.toEqual(a.slice(-6));
  });

  it("restores Math.random afterwards, even when the script throws", () => {
    setScriptRunner(scriptRunner);
    const original = Math.random;
    expect(() => generate(docWith(asScript("layer({ apply() { throw new Error('nope'); } })")), H)).toThrow(/nope/);
    expect(Math.random).toBe(original);
  });

  it("says so when apply forgets to return the scene", () => {
    setScriptRunner(scriptRunner);
    expect(() => generate(docWith(asScript("layer({ apply(scene) { addItems(scene, []); } })")), H)).toThrow(/must return the scene/);
  });
});
