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
