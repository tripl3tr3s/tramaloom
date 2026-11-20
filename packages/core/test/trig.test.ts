import { describe, expect, it } from "vitest";
import { dcos, dsin, TAU } from "../src/index.ts";

describe("deterministic trig", () => {
  it("matches Math.sin and Math.cos to 1e-12 across a wide range", () => {
    for (let i = -4000; i <= 4000; i++) {
      const x = i * 0.0137 + (i % 7) * 1e-3;
      expect(Math.abs(dsin(x) - Math.sin(x))).toBeLessThan(1e-12);
      expect(Math.abs(dcos(x) - Math.cos(x))).toBeLessThan(1e-12);
    }
  });

  it("is exact at the landmarks and periodic", () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(Math.abs(dsin(TAU / 4) - 1)).toBeLessThan(1e-15);
    expect(Math.abs(dsin(123.4) - dsin(123.4 + TAU * 5))).toBeLessThan(1e-11);
  });

  it("stays in range for huge inputs instead of blowing up", () => {
    for (const x of [1e15, -3.3e16, 9e17]) {
      expect(Math.abs(dsin(x))).toBeLessThanOrEqual(1);
      expect(Math.abs(dcos(x))).toBeLessThanOrEqual(1);
    }
  });
});
