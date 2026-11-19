import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtDocument } from "@gridloom/core";
import { builtinPresets, starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { assembleMint, scriptSafeCode } from "../src/assemble.ts";

const meta = { title: "Test", artist: "Someone", licence: "CC BY-NC 4.0", captureWidth: 2000, captureHeight: 2500 };
const RUNTIME = "window.__ok=1;";

describe("assembleMint", () => {
  it("is deterministic", () => {
    expect(assembleMint(RUNTIME, starterDocument, meta)).toBe(assembleMint(RUNTIME, starterDocument, meta));
  });

  it("embeds a document that round-trips exactly", () => {
    const html = assembleMint(RUNTIME, builtinPresets[1]?.doc ?? starterDocument, meta);
    const json = /<script id="gridloom-document" type="application\/json">(.*)<\/script>/.exec(html)?.[1] ?? "";
    expect(JSON.parse(json)).toEqual(builtinPresets[1]?.doc);
  });

  it("cannot be broken out of by hostile names", () => {
    const evil: ArtDocument = { ...starterDocument, name: "</script><script>alert(1)</script><!--" };
    const html = assembleMint(RUNTIME, evil, { ...meta, title: "<b>x</b>", artist: "a --> b <!--", licence: "x y" });
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    // Exactly one comment, closed once.
    expect(html.match(/<!--/g)).toHaveLength(1);
    expect(html.match(/-->/g)).toHaveLength(1);
    expect(html).toContain("<title>&#60;b&#62;x&#60;/b&#62;</title>");
  });

  it("documents seed format, signals, licences and trait weights", () => {
    const html = assembleMint(RUNTIME, starterDocument, meta);
    for (const s of ["?hash=", "genart:done", "window.$features", "CC BY-NC 4.0", "MIT", "Palette", "harbor 37.5%", "2000 x 2500"]) {
      expect(html).toContain(s);
    }
  });

  it("forbids network access with a content security policy", () => {
    expect(assembleMint(RUNTIME, starterDocument, meta)).toContain("default-src 'none'");
  });

  it("rejects a runtime that would close its script tag or change script parsing", () => {
    expect(() => assembleMint("x='</script>'", starterDocument, meta)).toThrow();
    expect(() => assembleMint("x='<!--';y='<script>'", starterDocument, meta)).toThrow();
  });

  it("declares the charset within the first 1024 bytes for every built-in preset", () => {
    builtinPresets.forEach((p) => {
      const bytes = new TextEncoder().encode(assembleMint(RUNTIME, p.doc, meta));
      const head = new TextDecoder().decode(bytes.slice(0, 1024));
      expect(head, p.id).toContain('<meta charset="utf-8">');
    });
  });

  it("keeps the document and title ASCII-only, so no charset guess can change them", () => {
    const named: ArtDocument = { ...starterDocument, name: "Paleta ámbar, Núñez \u{1F3A8}" };
    const html = assembleMint(RUNTIME, named, { ...meta, title: "Ámbar \u{1F3A8}" });
    const body = html.slice(html.indexOf("<title>"));
    expect(/[^\x00-\x7f]/.test(body)).toBe(false);
    const json = /<script id="gridloom-document" type="application\/json">(.*)<\/script>/.exec(html)?.[1] ?? "";
    expect(JSON.parse(json).name).toBe(named.name);
    expect(html).toContain("<title>&#193;mbar &#127912;</title>");
  });

  it("never truncates the trait weight table", () => {
    const many: ArtDocument = {
      ...starterDocument,
      traits: [
        {
          name: "Cols",
          layerId: "grid",
          param: "cols",
          bins: [...Array.from({ length: 11 }, (_, i) => ({ label: `Band number ${i + 1}`, upTo: 8 + i })), { label: "Last band" }],
        },
      ],
    };
    expect(assembleMint(RUNTIME, many, meta)).toContain("Last band");
  });
});

const built = join(import.meta.dirname, "../dist/runtime.js");
// Locally it may not be built yet; in CI it always is, so a missing bundle is a failure there.
describe.skipIf(!existsSync(built) && !process.env["CI"])("built runtime", () => {
  const code = existsSync(built) ? readFileSync(built, "utf8") : "";
  it("is small and has no unseeded randomness, clocks or network calls", () => {
    expect(code.length).toBeLessThan(80_000);
    expect(code).not.toMatch(/Math\.random|Date\.now|performance\.now|fetch\(|XMLHttpRequest|importScripts/);
  });
  it("can be inlined into a script element", () => {
    expect(() => scriptSafeCode(code)).not.toThrow();
  });
});
