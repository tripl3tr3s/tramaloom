import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ArtDocument } from "@tramaloom/core";
import { generate, setScriptRunner, starterDocument } from "@tramaloom/core";
import { afterEach, describe, expect, it } from "vitest";
// Test-only: the studio page itself never imports the compiler (see the guard below).
import { compileScript, scriptRunner } from "../../../packages/runtime/src/compile.ts";
import { initialState, reducer } from "../src/state/store.ts";
import { blankScript, STARTER_SCRIPT } from "../src/ui/code/starter.ts";
import { MAX_SCRIPT_CHARS } from "../src/state/limits.ts";
import { parseDocument, parseScriptParams } from "../src/state/schema.ts";

const script = {
  api: 1,
  label: "Rings",
  code: "layer({ apply(s) { return s; } })",
  params: { rings: { kind: "int", label: "Rings", help: "How many", min: 1, max: 20, default: 5 } },
};
const withLayer = (layer: object) => ({ ...starterDocument, layers: [...starterDocument.layers, layer] });
const scriptLayer = { id: "mine", module: "script", enabled: true, params: { rings: { value: 7 } }, script };

describe("script layers in documents", () => {
  it("load with their code and params", () => {
    expect(parseDocument(withLayer(scriptLayer))?.layers.at(-1)).toEqual(scriptLayer);
  });

  it("must carry a script exactly when the module is script", () => {
    expect(parseDocument(withLayer({ ...scriptLayer, script: undefined }))).toBeNull();
    expect(parseDocument(withLayer({ id: "f", module: "cellFill", enabled: true, params: {}, script }))).toBeNull();
  });

  it("refuse oversized code and unknown script versions", () => {
    expect(parseDocument(withLayer({ ...scriptLayer, script: { ...script, code: "x".repeat(MAX_SCRIPT_CHARS + 1) } }))).toBeNull();
    expect(parseDocument(withLayer({ ...scriptLayer, script: { ...script, api: 2 } }))).toBeNull();
  });
});

describe("parseScriptParams", () => {
  it("accepts every kind of setting", () => {
    const ok = parseScriptParams({
      size: { kind: "number", label: "Size", min: 0, max: 1, step: 0.01, default: 0.5, group: "Shape", help: "How big" },
      count: { kind: "int", label: "Count", min: 1, max: 9, default: 3 },
      mode: { kind: "enum", label: "Mode", options: ["a", "b"], default: "b", showIf: { param: "count", not: [1] } },
      on: { kind: "bool", label: "On", default: true },
      ink: { kind: "color", label: "Ink", default: "#12ab9f" },
    });
    expect(ok.ok).toBe(true);
  });

  it("says which setting is wrong and why", () => {
    const cases: [object, RegExp][] = [
      [{ n: { kind: "int", label: "N", min: 5, max: 1, default: 3 } }, /params\.n: min must be below max/],
      [{ n: { kind: "int", label: "N", min: 1, max: 5, default: 9 } }, /params\.n: default must be between/],
      [{ m: { kind: "enum", label: "M", options: ["a"], default: "z" } }, /params\.m: default must be one of/],
      [{ c: { kind: "color", label: "C", default: "red" } }, /params\.c\.default: a color default/],
      [{ x: { kind: "slider", label: "X" } }, /params\.x\.kind/],
      [{ "bad name": { kind: "bool", label: "B", default: true } }, /params/],
      [{ s: { kind: "number", label: "S", min: 0, max: 1, step: 1e-9, default: 0 } }, /step is too small/],
    ];
    for (const [input, message] of cases) {
      const r = parseScriptParams(input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(message);
    }
  });
});

describe("the studio page never runs script code itself", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  it("installs no script runner and has no eval or new Function", () => {
    // The sandbox's engine is imported as text (?raw) and only ever runs inside the sandbox iframe.
    const banned = /setScriptRunner|scriptRunner|compileScript|runtime\/src\/(?:compile|sandbox)\.ts|\beval\s*\(|new\s+Function\s*\(/;
    const offenders = files(join(import.meta.dirname, "../src")).filter((f) => banned.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("the starter script", () => {
  afterEach(() => setScriptRunner(null));
  const H = "a".repeat(64);

  it("declares exactly the params stored with it, and they validate", () => {
    const c = compileScript(STARTER_SCRIPT.code);
    expect(c.label).toBe(STARTER_SCRIPT.label);
    expect(c.params).toEqual(STARTER_SCRIPT.params);
    expect(parseScriptParams(c.params)).toEqual({ ok: true, params: STARTER_SCRIPT.params });
  });

  it("draws outlines in every grid cell, and in the frame without a grid", () => {
    setScriptRunner(scriptRunner);
    const layer = { id: "rings", module: "script", enabled: true, params: {}, script: STARTER_SCRIPT };
    const withGrid: ArtDocument = { ...starterDocument, layers: [...starterDocument.layers, layer] };
    const before = generate(starterDocument, H).scene;
    const after = generate(withGrid, H).scene;
    const added = after.items.slice(before.items.length);
    expect(added.length).toBe(before.cells.length * 4);
    expect(added.every((it) => it.type === "circle" && !it.fill && it.stroke === "#1d3557")).toBe(true);
    const noGrid: ArtDocument = { ...starterDocument, layers: [...starterDocument.layers.filter((l) => l.module !== "grid"), layer] };
    expect(generate(noGrid, H).scene.items.length).toBeGreaterThanOrEqual(4);
  });
});

describe("store: script layers", () => {
  const H = "a".repeat(64);
  it("a new Script layer starts with the starter script and is selected", () => {
    const s = reducer(initialState(starterDocument, H), { type: "addLayer", module: "script" });
    const added = s.doc.layers.find((l) => l.module === "script");
    expect(added?.script).toEqual(STARTER_SCRIPT);
    expect(s.selectedId).toBe(added?.id);
  });

  it("setScript replaces the code and drops settings of params that are gone", () => {
    let s = reducer(initialState(starterDocument, H), { type: "addLayer", module: "script" });
    const id = s.selectedId ?? "";
    s = reducer(s, { type: "setParam", layerId: id, name: "rings", setting: { value: 9 }, record: true });
    s = reducer(s, { type: "setParam", layerId: id, name: "wobble", setting: { value: 0.5 }, record: true });
    const next = { ...STARTER_SCRIPT, code: "layer({ apply(s) { return s; } })", params: { rings: STARTER_SCRIPT.params["rings"] } } as typeof STARTER_SCRIPT;
    s = reducer(s, { type: "setScript", layerId: id, script: next });
    const layer = s.doc.layers.find((l) => l.id === id);
    expect(layer?.script).toEqual(next);
    expect(layer?.params).toEqual({ rings: { value: 9 } });
    expect(reducer(s, { type: "undo" }).doc.layers.find((l) => l.id === id)?.script).toEqual(STARTER_SCRIPT);
  });

  it("setScript leaves other layers alone", () => {
    const s = initialState(starterDocument, H);
    expect(reducer(s, { type: "setScript", layerId: "grid", script: STARTER_SCRIPT })).toBe(s);
  });
});

describe("store: remixLayer", () => {
  const H = "a".repeat(64);
  const script = { api: 1, label: "Cell fill remix", code: "layer({ apply(s) { return s; } })", params: {} };
  it("turns a drawing layer into a script layer with the same id, settings and place", () => {
    let s = initialState(starterDocument, H);
    const fill = s.doc.layers.find((l) => l.module === "cellFill");
    if (!fill) throw new Error("no cell fill");
    s = reducer(s, { type: "setParam", layerId: fill.id, name: "fillChance", setting: { value: 0.5 }, record: true });
    const r = reducer(s, { type: "remixLayer", layerId: fill.id, script });
    const i = s.doc.layers.findIndex((l) => l.id === fill.id);
    expect(r.doc.layers[i]).toEqual({ ...s.doc.layers[i], module: "script", script });
    expect(reducer(r, { type: "undo" }).doc).toEqual(s.doc);
  });

  it("leaves pinned setup layers alone", () => {
    const s = initialState(starterDocument, H);
    for (const module of ["canvas", "grid", "palette"]) {
      const l = s.doc.layers.find((x) => x.module === module);
      if (l) expect(reducer(s, { type: "remixLayer", layerId: l.id, script }), module).toBe(s);
    }
  });
});

describe("the blank script", () => {
  afterEach(() => setScriptRunner(null));
  for (const lang of ["en", "es"] as const) {
    it(`${lang}: compiles to its stored label and params, and draws nothing until something is added`, () => {
      const blank = blankScript(lang);
      const c = compileScript(blank.code);
      expect(c.label).toBe(blank.label);
      expect(c.params).toEqual(blank.params);
      setScriptRunner(scriptRunner);
      const H = "a".repeat(64);
      const doc = { ...starterDocument, layers: [...starterDocument.layers, { id: "b", module: "script", enabled: true, params: {}, script: blank }] };
      expect(generate(doc, H).scene.items).toEqual(generate(starterDocument, H).scene.items);
      // Uncommenting the example draws exactly that circle.
      const example = blank.code.replace("    // items.push(", "    items.push(");
      setScriptRunner(scriptRunner);
      const withCircle = { ...doc, layers: [...starterDocument.layers, { id: "b", module: "script", enabled: true, params: {}, script: { ...blank, code: example } }] };
      expect(generate(withCircle, H).scene.items.at(-1)?.type).toBe("circle");
    });
  }
});
