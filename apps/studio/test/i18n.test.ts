import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n/i18n.tsx";
import { en, es } from "../src/i18n/messages.ts";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("messages", () => {
  it("Spanish has exactly the English keys", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("every message has the same placeholders in both languages, and none is empty", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[key]), key).toEqual(placeholders(en[key]));
      expect(en[key].trim(), key).not.toBe("");
      expect(es[key].trim(), key).not.toBe("");
    }
  });

  it("has no em dashes", () => {
    for (const text of [...Object.values(en), ...Object.values(es)]) expect(text).not.toContain("—");
  });

  it("fills placeholders, and leaves unknown ones visible", () => {
    expect(translate("es", "lessons.step", { n: 2, total: 4 })).toBe("Paso 2 de 4");
    expect(translate("en", "lessons.step", { n: 2 })).toBe("Step 2 of {total}");
  });
});

describe("studio text goes through the messages", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
    });
  // Words that are the same in every language, or names.
  const allowed = new Set(["Tramaloom", "SVG", "PNG", "JSON", "GitHub"]);

  it("no .tsx file writes English words straight into the page", () => {
    const found: string[] = [];
    for (const file of files(join(import.meta.dirname, "../src"))) {
      const src = readFileSync(file, "utf8");
      const jsxText = [...src.matchAll(/>\s*([A-Z][a-z]+(?:[ ,.'][a-z]+)+[.!?]?)\s*</g)].map((m) => m[1] ?? "");
      const attrs = [...src.matchAll(/\b(?:title|aria-label|placeholder|alt)="([A-Z][a-z][^"]*)"/g)].map((m) => m[1] ?? "");
      for (const text of [...jsxText, ...attrs]) if (!allowed.has(text)) found.push(`${file.split("/src/")[1]}: ${text}`);
    }
    expect(found).toEqual([]);
  });
});
