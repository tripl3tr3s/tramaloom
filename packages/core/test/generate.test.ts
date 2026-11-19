import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ArtDocument } from "../src/index.ts";
import { generate, starterDocument, toSVG } from "../src/index.ts";

const A = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const B = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const fingerprint = (doc: ArtDocument, hash: string): string => {
  const out = generate(doc, hash);
  return JSON.stringify({ resolved: out.resolved, items: out.scene.items, cells: out.scene.cells });
};

describe("generate", () => {
  it("is byte-identical for the same doc and hash", () => {
    expect(fingerprint(starterDocument, A)).toBe(fingerprint(starterDocument, A));
  });

  it("differs across hashes", () => {
    expect(fingerprint(starterDocument, A)).not.toBe(fingerprint(starterDocument, B));
  });

  it("leaks no state between renders ([A,B,A])", () => {
    const first = fingerprint(starterDocument, A);
    fingerprint(starterDocument, B);
    expect(fingerprint(starterDocument, A)).toBe(first);
  });

  it("isolates layers: appending a layer leaves earlier output unchanged", () => {
    const before = generate(starterDocument, A).scene.items;
    const extended: ArtDocument = {
      ...starterDocument,
      layers: [...starterDocument.layers, { id: "fill2", module: "cellFill", enabled: true, params: { inset: { value: 0.5 } } }],
    };
    const after = generate(extended, A).scene.items;
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("isolates params: changing a fill param does not change resolved grid/palette values", () => {
    const tweaked: ArtDocument = {
      ...starterDocument,
      layers: starterDocument.layers.map((l) => (l.id === "fill" ? { ...l, params: { ...l.params, fillChance: { value: 0.3 } } } : l)),
    };
    const pick = (doc: ArtDocument) => generate(doc, A).resolved.filter((r) => r.id !== "fill");
    expect(pick(tweaked)).toEqual(pick(starterDocument));
  });

  it("keeps cell colors stable when fill chance changes (one color draw per cell)", () => {
    const withChance = (p: number): ArtDocument => ({
      ...starterDocument,
      layers: starterDocument.layers.map((l) => (l.id === "fill" ? { ...l, params: { fillChance: { value: p } } } : l)),
    });
    const full = generate(withChance(1), A).scene.items;
    const partial = generate(withChance(0.5), A).scene.items;
    const key = (it: (typeof full)[number]) => JSON.stringify(it);
    const fullSet = new Set(full.map(key));
    partial.forEach((it) => expect(fullSet.has(key(it))).toBe(true));
  });

  it("throws on an unknown module", () => {
    const bad: ArtDocument = { ...starterDocument, layers: [{ id: "x", module: "nope", enabled: true, params: {} }] };
    expect(() => generate(bad, A)).toThrow(/Unknown module/);
  });

  it("serialises to SVG with one element per item plus background", () => {
    const out = generate(starterDocument, A);
    const svg = toSVG(out.scene);
    expect(svg.startsWith("<svg")).toBe(true);
    const elements = svg.split("\n").filter((l) => /^<(rect|circle|polyline|polygon)/.test(l));
    expect(elements.length).toBe(out.scene.items.length + 1);
  });
});

describe("source hygiene", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });

  it("core never touches non-deterministic globals", () => {
    const offenders = files(join(import.meta.dirname, "../src")).filter((f) =>
      /Math\.random|Date\.now|performance\.now|new Date\(|crypto\./.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("registry lookup", () => {
  it("treats Object.prototype names as unknown modules", () => {
    const bad: ArtDocument = { ...starterDocument, layers: [{ id: "x", module: "constructor", enabled: true, params: {} }] };
    expect(() => generate(bad, A)).toThrow(/Unknown module/);
  });
});
