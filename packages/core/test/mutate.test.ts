import { describe, expect, it } from "vitest";
import type { ArtDocument, Layer } from "../src/index.ts";
import { defaultRegistry, getModule, mutateDocument, starterDocument, stream } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const rngs = (tag: string) => (label: string) => stream(H, `mutate/${tag}/${label}`);

const rich: ArtDocument = {
  ...starterDocument,
  layers: [
    ...starterDocument.layers,
    { id: "tiles", module: "tiles", enabled: true, params: { lines: { value: 2 }, motif: { value: "arcs", locked: true } } },
    { id: "circ", module: "circuits", enabled: true, params: {} },
  ],
};

describe("mutateDocument", () => {
  it("changes nothing at amount 0", () => {
    expect(mutateDocument(rich, rngs("a"), { amount: 0 })).toEqual(rich);
  });

  it("is deterministic for the same streams", () => {
    expect(mutateDocument(rich, rngs("a"), { amount: 0.6 })).toEqual(mutateDocument(rich, rngs("a"), { amount: 0.6 }));
    expect(mutateDocument(rich, rngs("a"), { amount: 0.6 })).not.toEqual(mutateDocument(rich, rngs("b"), { amount: 0.6 }));
  });

  it("never touches locked settings or the canvas by default", () => {
    Array.from({ length: 30 }, (_, i) => mutateDocument(rich, rngs(`t${i}`), { amount: 1 })).forEach((m) => {
      expect(m.layers.find((l) => l.id === "tiles")?.params["motif"]).toEqual({ value: "arcs", locked: true });
      expect(m.layers.find((l) => l.module === "canvas")).toEqual(rich.layers.find((l) => l.module === "canvas"));
    });
  });

  it("only mutates the requested layers", () => {
    const m = mutateDocument(rich, rngs("c"), { amount: 1, layers: ["circ"] });
    m.layers.filter((l) => l.id !== "circ").forEach((l, i) => expect(l).toEqual(rich.layers.filter((x) => x.id !== "circ")[i]));
    expect(m.layers.find((l) => l.id === "circ")).not.toEqual(rich.layers.find((l) => l.id === "circ"));
  });

  it("keeps every value inside its spec and varying ranges ordered", () => {
    Array.from({ length: 40 }, (_, i) => mutateDocument(rich, rngs(`v${i}`), { amount: 1 })).forEach((m) => {
      m.layers.forEach((l: Layer) => {
        const def = getModule(defaultRegistry, l.module);
        Object.entries(l.params).forEach(([name, s]) => {
          const spec = def?.params[name];
          if (!spec) return;
          if (spec.kind === "number" || spec.kind === "int") {
            expect(s.value).toBeGreaterThanOrEqual(spec.min);
            expect(s.value).toBeLessThanOrEqual(spec.max);
            if (spec.kind === "int") expect(Number.isInteger(s.value)).toBe(true);
            if (s.vary?.kind === "range") {
              expect(s.vary.min).toBeLessThanOrEqual(s.vary.max);
              expect(s.vary.min).toBeGreaterThanOrEqual(spec.min);
              expect(s.vary.max).toBeLessThanOrEqual(spec.max);
            }
          }
          if (spec.kind === "enum") expect(spec.options).toContain(s.value);
        });
      });
    });
  });

  it("shifts weights without growing their total, and mutates weighted numbers", () => {
    const weighted: ArtDocument = {
      ...rich,
      layers: rich.layers.map((l) =>
        l.id === "grid" ? { ...l, params: { cols: { value: 8, vary: { kind: "weights", weights: { "6": 1, "8": 2, "10": 1 } } } } } : l,
      ),
    };
    const total = (d: ArtDocument) => {
      const v = d.layers.find((l) => l.id === "grid")?.params["cols"]?.vary;
      return v?.kind === "weights" ? Object.values(v.weights).reduce((a, b) => a + b, 0) : NaN;
    };
    let d = weighted;
    let moved = false;
    for (let i = 0; i < 60; i++) {
      const next = mutateDocument(d, rngs(`w${i}`), { amount: 1, layers: ["grid"] });
      if (JSON.stringify(next) !== JSON.stringify(d)) moved = true;
      d = next;
      expect(total(d)).toBe(4);
    }
    expect(moved).toBe(true);
  });

  it("leaves disabled layers alone", () => {
    const off: ArtDocument = { ...rich, layers: rich.layers.map((l) => (l.id === "circ" ? { ...l, enabled: false } : l)) };
    Array.from({ length: 10 }, (_, i) => mutateDocument(off, rngs(`d${i}`), { amount: 1 })).forEach((m) =>
      expect(m.layers.find((l) => l.id === "circ")).toEqual(off.layers.find((l) => l.id === "circ")),
    );
  });

  it("grows changes with amount", () => {
    const changed = (amount: number) =>
      Array.from({ length: 20 }, (_, i) => mutateDocument(rich, rngs(`g${i}`), { amount })).filter(
        (m) => JSON.stringify(m) !== JSON.stringify(mutateDocument(rich, rngs("x"), { amount: 0 })),
      ).length;
    expect(changed(1)).toBeGreaterThanOrEqual(changed(0.1));
    expect(changed(1)).toBeGreaterThan(15);
  });
});
