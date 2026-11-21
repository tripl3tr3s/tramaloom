import type { ArtDocument } from "@gridloom/core";
import { starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256 } from "../src/sandbox/sha256.ts";
import { approveScripts, drawable, fingerprint, isApproved, unapprovedCode, unapprovedScripts } from "../src/sandbox/trust.ts";
import { STARTER_SCRIPT } from "../src/ui/code/starter.ts";

const script = (code: string) => ({ api: 1, label: "S", code, params: {} });
const doc = (...codes: string[]): ArtDocument => ({
  ...starterDocument,
  layers: [...starterDocument.layers, ...codes.map((code, i) => ({ id: `s${i}`, module: "script", enabled: true, params: {}, script: script(code) }))],
});

describe("script trust", () => {
  it("trusts the starter script, and nothing else, out of the box", () => {
    expect(isApproved(STARTER_SCRIPT.code)).toBe(true);
    expect(unapprovedScripts(doc(STARTER_SCRIPT.code))).toEqual([]);
    expect(unapprovedScripts(doc("layer({ apply(s) { return s; } }) // shared"))).toEqual(["layer({ apply(s) { return s; } }) // shared"]);
  });

  it("leaves unapproved script layers out of the drawing, and only those", () => {
    const d = doc(STARTER_SCRIPT.code, "evil()");
    const out = drawable(d);
    expect(out.layers.find((l) => l.id === "s0")?.enabled).toBe(true);
    expect(out.layers.find((l) => l.id === "s1")?.enabled).toBe(false);
    expect(out.layers.filter((l) => l.module !== "script")).toEqual(d.layers.filter((l) => l.module !== "script"));
    expect(drawable(starterDocument)).toBe(starterDocument);
  });

  it("an approval covers that exact code, wherever it appears", () => {
    approveScripts(["evil()"]);
    expect(unapprovedScripts(doc("evil()", "evil()"))).toEqual([]);
    expect(unapprovedScripts(doc("evil() "))).toEqual(["evil() "]);
  });

  it("remembers code by its SHA-256, matching Node's crypto on every kind of input", () => {
    const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "x".repeat(20_000), "dsin(TAU) // ¿Año? 渦 🌀", STARTER_SCRIPT.code];
    for (const text of inputs) expect(sha256(text), text.slice(0, 20)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
    expect(fingerprint("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("trusts the starter by its exact text, not by any fingerprint", () => {
    expect(isApproved(STARTER_SCRIPT.code)).toBe(true);
    expect(isApproved(`${STARTER_SCRIPT.code} `)).toBe(false);
  });

  it("counts hidden script layers as code the piece carries, though they are not drawn", () => {
    const d = doc("hidden()");
    const hidden: ArtDocument = { ...d, layers: d.layers.map((l) => (l.module === "script" ? { ...l, enabled: false } : l)) };
    expect(unapprovedScripts(hidden)).toEqual([]);
    expect(unapprovedCode(hidden)).toEqual(["hidden()"]);
  });
});
