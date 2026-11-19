import { describe, expect, it } from "vitest";
import type { EnumSpec, IntSpec, NumberSpec } from "../src/index.ts";
import { resolveParam, stream } from "../src/index.ts";

const num: NumberSpec = { kind: "number", label: "n", min: 0, max: 1, step: 0.05, default: 0.5 };
const int: IntSpec = { kind: "int", label: "i", min: 1, max: 10, default: 3 };
const en: EnumSpec = { kind: "enum", label: "e", options: ["a", "b", "c"], default: "a" };

const draws = <T>(f: (i: number) => T, n = 2000): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("resolveParam", () => {
  it("returns the clamped fixed value without vary", () => {
    expect(resolveParam(num, { value: 7 }, stream("1", "x"))).toBe(1);
    expect(resolveParam(int, { value: 4.6 }, stream("1", "x"))).toBe(5);
    expect(resolveParam(en, { value: "zzz" }, stream("1", "x"))).toBe("a");
    expect(resolveParam(num, undefined, stream("1", "x"))).toBe(0.5);
  });

  it("keeps int ranges inclusive and in bounds", () => {
    const vs = draws((i) => resolveParam(int, { value: 3, vary: { kind: "range", min: 2, max: 4, dist: "uniform" } }, stream(String(i), "p")));
    expect(new Set(vs)).toEqual(new Set([2, 3, 4]));
  });

  it("snaps number ranges to step", () => {
    const vs = draws((i) => resolveParam(num, { value: 0, vary: { kind: "range", min: 0.2, max: 0.8, dist: "uniform" } }, stream(String(i), "p")) as number);
    vs.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0.2);
      expect(v).toBeLessThanOrEqual(0.8);
      expect(Math.abs(v / 0.05 - Math.round(v / 0.05))).toBeLessThan(1e-6);
    });
  });

  it("never picks zero-weight options and follows weights", () => {
    const vs = draws((i) => resolveParam(en, { value: "a", vary: { kind: "weights", weights: { a: 3, b: 1, c: 0 } } }, stream(String(i), "p")), 8000);
    expect(vs).not.toContain("c");
    const shareA = vs.filter((v) => v === "a").length / vs.length;
    expect(shareA).toBeGreaterThan(0.72);
    expect(shareA).toBeLessThan(0.78);
  });

  it("ignores vary when locked", () => {
    const vs = draws((i) => resolveParam(en, { value: "b", locked: true, vary: { kind: "weights", weights: { a: 1 } } }, stream(String(i), "p")), 50);
    expect(new Set(vs)).toEqual(new Set(["b"]));
  });
});
