import type { ArtDocument } from "@gridloom/core";
import { starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { approveScripts, drawable, fingerprint, isApproved, unapprovedScripts } from "../src/sandbox/trust.ts";
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

  it("fingerprints differ for different code and are stable for the same code", () => {
    expect(fingerprint("a")).toBe(fingerprint("a"));
    expect(fingerprint("a")).not.toBe(fingerprint("b"));
  });
});
