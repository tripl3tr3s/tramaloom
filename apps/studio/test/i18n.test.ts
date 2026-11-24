import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { builtinPresets, defaultRegistry } from "@tramaloom/core";
import { describe, expect, it } from "vitest";
import { GROUPS_ES, MODULES_ES, PRESETS_ES } from "../src/i18n/core/index.ts";
import { coreText } from "../src/i18n/coreText.ts";
import { translate } from "../src/i18n/i18n.tsx";
import { en, es } from "../src/i18n/messages.ts";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages", () => {
  it("Spanish has exactly the English keys", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("every message has the same placeholders in both languages, and none is empty", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
      expect(en[key].trim(), key).not.toBe("");
      expect(es[key].trim(), key).not.toBe("");
    }
  });

  it("has no em dashes", () => {
    for (const text of [...Object.values(en), ...Object.values(es)]) expect(text).not.toContain("—");
  });

  it("fills placeholders, and leaves unknown ones visible", () => {
    expect(translate("es", "lessons.step", { n: 2, total: 4 })).toBe("Paso 2 de 4");
    expect(translate("en", "lessons.step", { n: 2 })).toBe("Step 2 of {total}");
  });
});

describe("studio text goes through the messages", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
    });
  // Words that are the same in every language, or names.
  const allowed = new Set(["Tramaloom", "SVG", "PNG", "JSON", "GitHub"]);

  it("no .tsx file writes English words straight into the page", () => {
    const found: string[] = [];
    for (const file of files(join(import.meta.dirname, "../src"))) {
      const src = readFileSync(file, "utf8");
      const jsxText = [...src.matchAll(/>\s*([A-Z][a-z]+(?:[ ,.'][a-z]+)+[.!?]?)\s*</g)].map((m) => m[1] ?? "");
      const attrs = [...src.matchAll(/\b(?:title|aria-label|placeholder|alt)="([A-Z][a-z][^"]*)"/g)].map((m) => m[1] ?? "");
      for (const text of [...jsxText, ...attrs]) if (!allowed.has(text)) found.push(`${file.split("/src/")[1]}: ${text}`);
    }
    expect(found).toEqual([]);
  });
});

describe("Spanish for modules and presets", () => {
  const modules = Object.values(defaultRegistry);

  it("every built-in module, setting and option has Spanish, and nothing is left over", () => {
    const missing: string[] = [];
    for (const m of modules) {
      const es = MODULES_ES[m.id];
      if (!es) {
        missing.push(m.id);
        continue;
      }
      for (const [name, spec] of Object.entries(m.params)) {
        const p = es.params[name];
        if (!p) missing.push(`${m.id}.${name}`);
        else if (spec.kind === "enum") {
          // Ratios like 3:4 read the same in every language.
          for (const o of spec.options) if (!/^[\d.:]+$/.test(o) && !p.options?.[o]) missing.push(`${m.id}.${name}=${o}`);
          for (const o of Object.keys(p.options ?? {})) if (!spec.options.includes(o)) missing.push(`extra ${m.id}.${name}=${o}`);
        } else if (p.options) missing.push(`extra options on ${m.id}.${name}`);
      }
      for (const name of Object.keys(es.params)) if (!(name in m.params)) missing.push(`extra ${m.id}.${name}`);
    }
    for (const id of Object.keys(MODULES_ES)) if (!defaultRegistry[id]) missing.push(`extra module ${id}`);
    expect(missing).toEqual([]);
  });

  it("every settings group and preset has a Spanish name, and none is left over", () => {
    const groups = new Set(modules.flatMap((m) => Object.values(m.params).flatMap((p) => (p.group ? [p.group] : []))));
    expect([...groups].filter((g) => !GROUPS_ES[g])).toEqual([]);
    expect(Object.keys(GROUPS_ES).filter((g) => !groups.has(g))).toEqual([]);
    const presets = builtinPresets.map((p) => p.id);
    expect(presets.filter((p) => !PRESETS_ES[p])).toEqual([]);
    expect(Object.keys(PRESETS_ES).filter((p) => !presets.includes(p))).toEqual([]);
  });

  it("the Spanish is not empty, has no em dashes, and differs from the English where it should", () => {
    const texts = Object.values(MODULES_ES).flatMap((m) => [
      m.label,
      m.description,
      ...Object.values(m.params).flatMap((p) => [p.label, p.help, ...Object.values(p.options ?? {})]),
    ]);
    for (const text of [...texts, ...Object.values(GROUPS_ES), ...Object.values(PRESETS_ES)]) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toContain("—");
    }
    for (const m of modules) {
      const es = MODULES_ES[m.id];
      // Names that are the same in both languages: Color, Script, the attractor's a, b, c, d.
      if (es && m.description) expect(es.description, m.id).not.toBe(m.description);
    }
  });

  it("falls back to English for anything without Spanish, and stays English in English", () => {
    const es = coreText("es");
    const en = coreText("en");
    expect(es.moduleLabel("grid", "Grid")).toBe("Cuadrícula");
    expect(en.moduleLabel("grid", "Grid")).toBe("Grid");
    expect(es.moduleLabel("notAModule", "Thing")).toBe("Thing");
    const spec = defaultRegistry["grid"]?.params["cols"];
    if (!spec) throw new Error("no grid cols");
    expect(es.spec("grid", "cols", spec).label).toBe("Columnas");
    expect(es.spec("grid", "cols", spec)).toEqual({ ...spec, label: "Columnas", help: "Celdas a lo ancho" });
    expect(es.spec("script", "rings", spec)).toBe(spec);
    expect(es.optionLabel("grid", "mask", "circle")).toBe("círculo");
    expect(es.optionLabel("canvas", "aspect", "3:4")).toBe("3:4");
    expect(es.group("Layout")).toBe("Disposición");
    expect(es.presetName("knotwork", "Knotwork")).toBe("Entrelazado");
    expect(en.presetName("knotwork", "Knotwork")).toBe("Knotwork");
  });
});
