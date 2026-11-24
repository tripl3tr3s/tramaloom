import { builtinPresets, generate } from "@tramaloom/core";
import { describe, expect, it } from "vitest";
import { GLOSSARY, PLOT_GUIDE } from "../src/lessons/guides.ts";

const texts = [PLOT_GUIDE.title, PLOT_GUIDE.summary, ...PLOT_GUIDE.steps.flatMap((s) => [s.title, s.body]), ...GLOSSARY.flatMap((g) => [g.term, g.meaning])];

describe("Learn's guide and glossary", () => {
  it("are complete in English and Spanish, without em dashes", () => {
    for (const text of texts) {
      for (const lang of ["en", "es"] as const) {
        expect(text[lang].trim().length).toBeGreaterThan(0);
        expect(text[lang]).not.toContain("—");
      }
    }
  });

  it("the presets the guide recommends are made of lines (grain texture aside)", () => {
    for (const name of ["Currents", "Topography", "Knotwork", "Specimens", "Resonance"]) {
      const preset = builtinPresets.find((p) => p.doc.name === name);
      if (!preset) throw new Error(`no preset ${name}`);
      const filled = generate(preset.doc, preset.hash).scene.items.filter((it) => it.fill && !it.stroke && !(it.type === "dots" && it.texture));
      expect(filled, name).toEqual([]);
    }
  });

  it("the preset it warns about is thousands of dots", () => {
    const chaos = builtinPresets.find((p) => p.doc.name === "Chaos");
    if (!chaos) throw new Error("no Chaos");
    const dots = generate(chaos.doc, chaos.hash).scene.items.filter((it) => it.type === "dots" && !it.texture).reduce((n, it) => n + (it.type === "dots" ? it.points.length : 0), 0);
    expect(dots).toBeGreaterThan(1000);
  });
});
