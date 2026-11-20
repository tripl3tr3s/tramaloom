import { describe, expect, it } from "vitest";
import { defaultRegistry } from "../src/index.ts";

describe("param documentation", () => {
  const all = Object.values(defaultRegistry).flatMap((m) => Object.entries(m.params).map(([name, spec]) => ({ m, name, spec })));

  it("gives every setting a help text", () => {
    expect(all.filter(({ spec }) => !spec.help?.trim()).map(({ m, name }) => `${m.id}.${name}`)).toEqual([]);
  });

  it("points every showIf at a real setting of the same module, with values it can take", () => {
    const bad = all.flatMap(({ m, name, spec }) => {
      const cond = spec.showIf;
      if (!cond) return [];
      const target = m.params[cond.param];
      if (!target || cond.param === name) return [`${m.id}.${name}: no setting ${cond.param}`];
      const values = [...(cond.is ?? []), ...(cond.not ?? [])];
      const fits = (v: unknown) =>
        target.kind === "enum" ? target.options.includes(String(v)) : target.kind === "bool" ? typeof v === "boolean" : typeof v === "number";
      return values.every(fits) && values.length ? [] : [`${m.id}.${name}: values ${JSON.stringify(values)} do not fit ${cond.param}`];
    });
    expect(bad).toEqual([]);
  });
});
