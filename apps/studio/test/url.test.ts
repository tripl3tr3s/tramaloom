import { ENGINE_VERSION, starterDocument } from "@gridloom/core";
import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/state/schema.ts";
import { decodeState, encodeState } from "../src/state/url.ts";

const H = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";

describe("url codec", () => {
  it("round-trips document and hash", async () => {
    const frag = await encodeState(starterDocument, H);
    expect(frag.length).toBeLessThan(2000);
    const out = await decodeState(`#${frag}`);
    expect(out.hash).toBe(H);
    expect(out.doc).toEqual(starterDocument);
    expect(out.engine).toBe(ENGINE_VERSION);
  });

  it("reads the engine version, defaulting to 1 and rejecting junk", async () => {
    expect((await decodeState(`#h=${H}&e=7`)).engine).toBe(7);
    expect((await decodeState(`#h=${H}&e=-3`)).engine).toBe(1);
    expect((await decodeState(`#h=${H}&e=1.5`)).engine).toBe(1);
    expect((await decodeState(`#h=${H}&e=1e2`)).engine).toBe(1);
  });

  it("can keep an older engine number when re-encoding an untouched link", async () => {
    const frag = await encodeState(starterDocument, H, 3);
    expect((await decodeState(`#${frag}`)).engine).toBe(3);
  });

  it("returns nulls for garbage instead of throwing", async () => {
    expect(await decodeState("#d=%%%&h=zzz")).toEqual({ doc: null, hash: null, engine: 1 });
    expect(await decodeState("")).toEqual({ doc: null, hash: null, engine: 1 });
  });
});

describe("parseDocument", () => {
  it("accepts the starter document", () => {
    expect(parseDocument(starterDocument)).toEqual(starterDocument);
  });

  it.each([
    ["unknown module", { ...starterDocument, layers: [...starterDocument.layers, { id: "x", module: "evil", enabled: true, params: {} }] }],
    ["canvas not first", { ...starterDocument, layers: [...starterDocument.layers].reverse() }],
    ["duplicate ids", { ...starterDocument, layers: [...starterDocument.layers, starterDocument.layers[1]] }],
    ["bad id chars", { ...starterDocument, layers: [{ ...starterDocument.layers[0], id: "<script>" }] }],
    ["wrong version", { ...starterDocument, version: 2 }],
    ["not an object", "hello"],
  ])("rejects %s", (_label, input) => {
    expect(parseDocument(input)).toBeNull();
  });
});

describe("review fixes: untrusted input", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("rejects prototype module name %s", (module) => {
    const doc = { ...starterDocument, layers: [...starterDocument.layers, { id: "a", module, enabled: true, params: {} }] };
    expect(parseDocument(doc)).toBeNull();
  });

  it("rejects a decompression bomb without inflating it all", async () => {
    const huge = new TextEncoder().encode(" ".repeat(20 * 1024 * 1024));
    const stream = new Blob([huge]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    const b64 = btoa(String.fromCharCode(...packed)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(b64.length).toBeLessThan(128 * 1024);
    const out = await decodeState(`#d=${b64}&h=${H}`);
    expect(out.doc).toBeNull();
    expect(out.hash).toBe(H);
  });
});
