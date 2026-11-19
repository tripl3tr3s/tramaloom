import { describe, expect, it } from "vitest";
import type { ArtDocument } from "../src/index.ts";
import {
  builtinPresets,
  census,
  censusFlags,
  computeTraits,
  expectedDistribution,
  generate,
  starterDocument,
  stepHash,
  traitsFromResolved,
} from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const hashes = (n: number) => Array.from({ length: n }, (_, i) => stepHash(H, i + 1));

describe("traits", () => {
  it("are a pure function of the hash and match what generate resolved", () => {
    hashes(20).forEach((h) => {
      const t = computeTraits(starterDocument, h);
      expect(computeTraits(starterDocument, h)).toEqual(t);
      expect(traitsFromResolved(starterDocument, generate(starterDocument, h).resolved)).toEqual(t);
    });
  });

  it("bin numbers and keep enums as words", () => {
    const t = computeTraits(starterDocument, H);
    expect(["Coarse", "Medium", "Fine"]).toContain(t["Density"]);
    expect(typeof t["Palette"]).toBe("string");
  });

  it("report None for a disabled layer", () => {
    const off: ArtDocument = { ...starterDocument, layers: starterDocument.layers.map((l) => (l.id === "grid" ? { ...l, enabled: false } : l)) };
    expect(computeTraits(off, H)["Density"]).toBe("None");
  });

  it("every built-in preset declares 3+ traits and computes them", () => {
    builtinPresets.filter((p) => p.doc.traits).forEach((p) => {
      expect(p.doc.traits?.length).toBeGreaterThanOrEqual(3);
      expect(Object.keys(computeTraits(p.doc, p.hash))).toHaveLength(p.doc.traits?.length ?? 0);
    });
  });
});

describe("expected distribution and census", () => {
  it("weights give exact shares and the census lands near them", () => {
    const n = 4000;
    const res = census(starterDocument, hashes(n));
    const palette = res.traits.find((t) => t.name === "Palette");
    const exp = palette?.expected;
    expect(exp?.exact).toBe(true);
    // harbor 3 / lagoon 2 / ember, moss, signal 1 each = 8
    expect(exp?.shares["harbor"]).toBeCloseTo(3 / 8, 10);
    Object.entries(exp?.shares ?? {}).forEach(([k, p]) => {
      const measured = (palette?.counts[k] ?? 0) / n;
      expect(Math.abs(measured - p)).toBeLessThan(0.03);
    });
  });

  it("int ranges with bins match the census", () => {
    const n = 4000;
    const density = census(starterDocument, hashes(n)).traits.find((t) => t.name === "Density");
    // cols uniform 8..18: Coarse 8-10 = 3/11, Medium 11-14 = 4/11, Fine 15-18 = 4/11
    expect(density?.expected?.shares["Coarse"]).toBeCloseTo(3 / 11, 10);
    expect(Math.abs((density?.counts["Coarse"] ?? 0) / n - 3 / 11)).toBeLessThan(0.03);
  });

  it("returns null for an unbinned continuous number", () => {
    const d: ArtDocument = { ...starterDocument, traits: [{ name: "Split", layerId: "grid", param: "splitChance" }] };
    expect(expectedDistribution(d, { name: "Split", layerId: "grid", param: "splitChance" })).toBeNull();
  });

  it("gaussian int shares sum to 1 (clamped tails land on the end values)", () => {
    const d: ArtDocument = {
      ...starterDocument,
      layers: starterDocument.layers.map((l) =>
        l.id === "grid" ? { ...l, params: { cols: { value: 10, vary: { kind: "range", min: 6, max: 16, dist: "gaussian" } } } } : l,
      ),
      traits: [{ name: "Cols", layerId: "grid", param: "cols" }],
    };
    const e = expectedDistribution(d, { name: "Cols", layerId: "grid", param: "cols" });
    const sum = Object.values(e?.shares ?? {}).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    const measured = census(d, hashes(4000)).traits[0];
    Object.entries(e?.shares ?? {}).forEach(([k, p]) => expect(Math.abs((measured?.counts[k] ?? 0) / 4000 - p)).toBeLessThan(0.03));
  });

  it("a trait on a missing setting expects None, like computeTraits", () => {
    const d: ArtDocument = { ...starterDocument, traits: [{ name: "Ghost", layerId: "grid", param: "nope" }] };
    expect(computeTraits(d, H)["Ghost"]).toBe("None");
    expect(expectedDistribution(d, { name: "Ghost", layerId: "grid", param: "nope" })?.shares).toEqual({ None: 1 });
  });

  it("does not flag never-seen values the sample was too small to show", () => {
    const f = censusFlags({ name: "X", counts: { a: 999 }, expected: { shares: { a: 0.999, b: 0.001 }, exact: true } }, 1000, 100000);
    expect(f["b"]).not.toContain("never");
  });

  it("flags values that never appear, dominate, or are too rare for the edition", () => {
    const flags = censusFlags(
      { name: "X", counts: { a: 9500, b: 500 }, expected: { shares: { a: 0.9, b: 0.0995, c: 0.0005 }, exact: true } },
      10000,
      500,
    );
    expect(flags["a"]).toContain("dominant");
    expect(flags["c"]).toEqual(expect.arrayContaining(["never", "too-rare"]));
    expect(flags["b"]).toEqual([]);
  });

  it("counts duplicate trait tuples", () => {
    const res = census(starterDocument, hashes(500));
    // 5 palettes x 4 zones x 3 densities = 60 tuples at most, so 500 seeds must repeat.
    expect(res.duplicateTuples).toBeGreaterThan(400);
  });
});
