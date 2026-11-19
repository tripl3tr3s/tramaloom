import { describe, expect, it } from "vitest";
import { hashFromRng, normaliseHash, seedFromHash, stepHash, stream } from "../src/index.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const take = (r: () => number, n: number): number[] => Array.from({ length: n }, () => r());

describe("prng", () => {
  it("is repeatable for the same hash and label", () => {
    expect(take(stream(H, "a"), 50)).toEqual(take(stream(H, "a"), 50));
  });

  it("treats 0x prefix and case as the same hash", () => {
    expect(seedFromHash(`0x${H.toUpperCase()}`)).toEqual(seedFromHash(H));
  });

  it("rejects non-hex input", () => {
    expect(() => normaliseHash("not-a-hash")).toThrow();
  });

  it("separates labels into independent streams", () => {
    expect(take(stream(H, "a"), 10)).not.toEqual(take(stream(H, "b"), 10));
  });

  it("does not collapse patterned hashes", () => {
    const patterned = ["a3f1a3f1", "b2c4b2c4", "00000000", "ffffffff", "12341234"].map((p) => p.repeat(8));
    const firsts = patterned.map((h) => stream(h, "x")());
    expect(new Set(firsts).size).toBe(patterned.length);
  });

  it("produces roughly uniform output in [0,1)", () => {
    const xs = take(stream(H, "u"), 20000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it("derives valid, reproducible hashes", () => {
    const h = hashFromRng(stream(H, "h"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(stepHash(H, 1)).toBe(stepHash(H, 1));
    expect(stepHash(H, 1)).not.toBe(stepHash(H, 2));
  });
});
