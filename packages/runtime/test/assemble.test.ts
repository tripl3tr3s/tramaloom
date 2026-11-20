import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtDocument } from "@gridloom/core";
import { builtinPresets, defaultRegistry, starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import type { Player } from "../src/assemble.ts";
import { assembleMint, modulesUsed, scriptSafeCode } from "../src/assemble.ts";

const meta = { title: "Test", artist: "Someone", licence: "CC BY-NC 4.0", captureWidth: 2000, captureHeight: 2500 };
// A stand-in player: tiny engine, and one marker script per module in the registry.
const RUNTIME: Player = {
  engine: "window.__ok=1;",
  modules: Object.fromEntries(Object.keys(defaultRegistry).map((id) => [id, `/*module:${id}*/`])),
};

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
    // Document, engine, one per module used, and the start call: nothing more.
    const scripts = 3 + modulesUsed(evil).length;
    expect(html.match(/<script/g)).toHaveLength(scripts);
    expect(html.match(/<\/script>/g)).toHaveLength(scripts);
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
    expect(() => assembleMint({ ...RUNTIME, engine: "x='</script>'" }, starterDocument, meta)).toThrow();
    expect(() => assembleMint({ ...RUNTIME, engine: "x='<!--';y='<script>'" }, starterDocument, meta)).toThrow();
    expect(() => assembleMint({ ...RUNTIME, modules: { ...RUNTIME.modules, grid: "x='</script>'" } }, starterDocument, meta)).toThrow();
  });

  it("includes exactly the modules the piece uses, in stack order", () => {
    const html = assembleMint(RUNTIME, starterDocument, meta);
    const included = [...html.matchAll(/\/\*module:(\w+)\*\//g)].map((m) => m[1]);
    expect(included).toEqual(["canvas", "palette", "grid", "cellFill"]);
    expect(html.indexOf("window.__ok=1;")).toBeLessThan(html.indexOf("/*module:canvas*/"));
    expect(html.trimEnd().endsWith("<script>GridloomRuntime.start()</script>\n</body>\n</html>")).toBe(true);
  });

  it("leaves out the modules of hidden layers: they are never drawn", () => {
    const hidden: ArtDocument = { ...starterDocument, layers: [...starterDocument.layers, { id: "t", module: "tiles", enabled: false, params: {} }] };
    expect(modulesUsed(hidden)).not.toContain("tiles");
    expect(assembleMint(RUNTIME, hidden, meta)).not.toContain("/*module:tiles*/");
  });

  it("refuses to build a page with a module the player lacks", () => {
    const { tiles: _drop, ...rest } = RUNTIME.modules;
    const weave = builtinPresets.find((p) => p.id === "weave")?.doc ?? starterDocument;
    expect(() => assembleMint({ ...RUNTIME, modules: rest }, weave, meta)).toThrow(/tiles/);
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
const builtModules = join(import.meta.dirname, "../dist/modules.json");
// Locally it may not be built yet; in CI it always is, so a missing bundle is a failure there.
describe.skipIf(!existsSync(built) && !process.env["CI"])("built player", () => {
  const engine = existsSync(built) ? readFileSync(built, "utf8") : "";
  const modules: Record<string, string> = existsSync(builtModules) ? JSON.parse(readFileSync(builtModules, "utf8")) : {};
  const forbidden = /Math\.random|Date\.now|performance\.now|fetch\(|XMLHttpRequest|importScripts/;

  it("has an engine with no modules in it, and a script for every registered module", () => {
    expect(engine.length).toBeLessThan(40_000);
    expect(Object.keys(modules).sort()).toEqual(Object.keys(defaultRegistry).sort());
    for (const [id, code] of Object.entries(modules)) expect(code, id).toContain(`registerModule(\`${id}\``);
  });

  it("has no unseeded randomness, clocks or network calls anywhere", () => {
    expect(engine).not.toMatch(forbidden);
    for (const [id, code] of Object.entries(modules)) expect(code, id).not.toMatch(forbidden);
  });

  it("keeps every built-in preset's page small: the engine plus only the modules it uses", () => {
    for (const p of builtinPresets) {
      const bytes = engine.length + modulesUsed(p.doc).reduce((sum, id) => sum + (modules[id]?.length ?? 0), 0);
      expect(bytes, p.id).toBeLessThan(80_000);
    }
  });

  it("can be inlined into script elements", () => {
    expect(() => scriptSafeCode(engine)).not.toThrow();
    for (const code of Object.values(modules)) expect(() => scriptSafeCode(code)).not.toThrow();
  });
});
