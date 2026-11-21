import type { ArtDocument } from "@gridloom/core";
import { generate, setScriptRunner, starterDocument } from "@gridloom/core";
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
});
