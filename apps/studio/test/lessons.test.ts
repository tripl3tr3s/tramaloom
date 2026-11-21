import type { ArtDocument } from "@gridloom/core";
import { generate, makeNoise2D, setScriptRunner, starterDocument, stream, toPlotterSVG } from "@gridloom/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Test-only: the studio page itself never imports the compiler.
import { compileScript, scriptRunner } from "../../../packages/runtime/src/compile.ts";
import type { Lang } from "../src/lessons/lessons.ts";
import { LESSONS } from "../src/lessons/lessons.ts";
import { MAX_SCRIPT_CHARS } from "../src/state/limits.ts";
import { parseScriptParams } from "../src/state/schema.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

/** Compiles the code and draws it on the starter document (which has a grid and a palette). */
function draw(code: string, values: Record<string, number> = {}) {
  const c = compileScript(code);
  const params = parseScriptParams(c.params);
  if (!params.ok) throw new Error(params.error);
  const doc: ArtDocument = {
    ...starterDocument,
    layers: [
      ...starterDocument.layers,
      {
        id: "lesson",
        module: "script",
        enabled: true,
        params: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }])),
        script: { api: 1, label: c.label, code, params: params.params },
      },
    ],
  };
  const before = generate(starterDocument, H).scene.items.length;
  return generate(doc, H).scene.items.slice(before);
}

beforeAll(() => setScriptRunner(scriptRunner));
afterAll(() => setScriptRunner(null));

describe("lessons", () => {
  for (const lesson of LESSONS) {
    describe(lesson.title.en, () => {
      const stages = [{ name: "start", code: lesson.start }, ...lesson.steps.flatMap((s, i) => (s.code ? [{ name: `step ${i + 1}`, code: s.code }] : []))];

      for (const stage of stages) {
        it(`${stage.name}: compiles, draws, and draws the same in English and Spanish`, () => {
          const en = stage.code("en");
          const es = stage.code("es");
          expect(en.length).toBeLessThanOrEqual(MAX_SCRIPT_CHARS);
          const a = draw(en);
          expect(a.length).toBeGreaterThan(0);
          expect(draw(es)).toEqual(a);
          // Only comments and labels differ.
          const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/(label|help): "[^"]*"/g, "$1").replace(/\s+/g, " ");
          expect(strip(es)).toBe(strip(en));
        });
      }

      it("every step with code changes the code", () => {
        const codes = stages.map((s) => s.code("en"));
        for (let i = 1; i < codes.length; i++) expect(codes[i], stages[i]?.name).not.toBe(codes[i - 1]);
      });

      it("has its text in both languages, without em dashes", () => {
        const texts = [lesson.title, lesson.summary, ...lesson.steps.flatMap((s) => [s.title, s.body])];
        for (const text of texts) {
          for (const lang of ["en", "es"] as const satisfies readonly Lang[]) {
            expect(text[lang].trim().length).toBeGreaterThan(0);
            expect(text[lang]).not.toContain("—");
          }
        }
      });
    });
  }

  // What the seeds lesson says about Fill must be true of its code.
  const sizesAt = (step: number, fill: number) => {
    const code = LESSONS.find((l) => l.id === "seeds")?.steps[step]?.code;
    if (!code) throw new Error("no step");
    return new Map(draw(code("en"), { fill }).flatMap((it) => (it.type === "rect" ? [[`${(it.x + it.w / 2).toFixed(6)},${(it.y + it.h / 2).toFixed(6)}`, it.w] as const] : [])));
  };
  const keptSizesChange = (step: number) => {
    const a = sizesAt(step, 0.5);
    const b = sizesAt(step, 0.9);
    return [...a].some(([centre, w]) => b.has(centre) && b.get(centre) !== w);
  };

  it("seeds lesson, step 2: with one stream, Fill shifts the sizes of the squares that stay", () => {
    expect(keptSizesChange(1)).toBe(true);
  });

  it("seeds lesson, step 3: with one stream per decision, Fill leaves sizes still", () => {
    expect(keptSizesChange(2)).toBe(false);
  });

  it("no lesson code uses math the editor warns about", () => {
    const risky = /Math\.(?:a?sinh?|a?cosh?|a?tanh?|atan2|exp|expm1|log1p|log2|log10|log|pow|cbrt|hypot)\b|\*\*|\bDate\b|performance\.now/;
    for (const lesson of LESSONS) {
      for (const code of [lesson.start, ...lesson.steps.flatMap((st) => (st.code ? [st.code] : []))]) {
        for (const lang of ["en", "es"] as const) expect(code(lang).replace(/\/\/.*$/gm, ""), lesson.id).not.toMatch(risky);
      }
    }
  });

  // What the noise lesson says must be true of the noise and of its code.
  it("noise lesson: noise stays between about 0.2 and 0.8 most of the time", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const noise = makeNoise2D(stream(H, seed));
      let inside = 0;
      let total = 0;
      for (let i = 0; i < 120; i++) {
        for (let j = 0; j < 120; j++) {
          const n = noise(i * 0.037, j * 0.041);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(1);
          if (n >= 0.2 && n <= 0.8) inside++;
          total++;
        }
      }
      expect(inside / total, seed).toBeGreaterThan(0.7);
    }
  });

  it("noise lesson, step 1: neighbouring cells get closer sizes than with plain randomness", () => {
    const lesson = LESSONS.find((l) => l.id === "noise");
    const step1 = lesson?.steps[0]?.code;
    if (!lesson || !step1) throw new Error("no lesson");
    // Mean size difference between side-by-side squares on the same row.
    const jump = (code: string) => {
      const rects = draw(code).flatMap((it) => (it.type === "rect" ? [{ cy: (it.y + it.h / 2).toFixed(6), w: it.w }] : []));
      const diffs = rects.slice(1).flatMap((r, i) => (rects[i]?.cy === r.cy ? [Math.abs(r.w - (rects[i]?.w ?? 0))] : []));
      return diffs.reduce((a, b) => a + b, 0) / diffs.length;
    };
    expect(jump(step1("en"))).toBeLessThan(jump(lesson.start("en")) * 0.7);
  });

  // What the plotter lesson says must be true of the plotter export.
  const plotStep = (i: number) => {
    const code = LESSONS.find((l) => l.id === "plotter")?.steps[i]?.code;
    if (!code) throw new Error("no step");
    const items = draw(code("en"));
    return { items, plot: toPlotterSVG({ width: 1, height: 1, cornerRadius: 0, background: "#ffffff", items }) };
  };

  it("plotter lesson, step 1: every shape is an outline", () => {
    const { items } = plotStep(0);
    expect(items.every((it) => it.stroke !== undefined && it.fill === undefined)).toBe(true);
  });

  it("plotter lesson, step 3: two inks become two pens", () => {
    expect(plotStep(2).plot.layers.map((l) => l.color).sort()).toEqual(["#1d3557", "#e63946"]);
  });

  it("plotter lesson, step 4: the zigzag lifts the pen far less, with the same pens", () => {
    const before = plotStep(2).plot.layers;
    const after = plotStep(3).plot.layers;
    const lifts = (ls: typeof before) => ls.reduce((n, l) => n + l.lifts, 0);
    expect(after.map((l) => l.color).sort()).toEqual(before.map((l) => l.color).sort());
    expect(lifts(after)).toBeLessThan(lifts(before) / 2);
  });
});
