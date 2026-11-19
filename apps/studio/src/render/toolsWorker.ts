import { census, drawScene, generate, pixelSize, seedSeries, traitsFromResolved } from "@gridloom/core";
import type { ToolRequest, ToolResponse } from "./protocol.ts";
import type { ZipEntry } from "./zip.ts";
import { entryFromBlob, entryFromBytes, zip } from "./zip.ts";

// A zip without ZIP64 tops out at 4 GB; stop early instead of after rendering everything.
const MAX_BYTES = 3_500_000_000;

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToolRequest>) => void) | null;
  postMessage(msg: ToolResponse): void;
}
const scope = self as unknown as WorkerScope;


async function batch(req: Extract<ToolRequest, { kind: "batch" }>): Promise<Blob> {
  const hashes = seedSeries(req.root, req.count);
  const entries: ZipEntry[] = [];
  let bytes = 0;
  const manifest: { hash: string; file: string; traits: Record<string, string | number> }[] = [];
  for (const [i, hash] of hashes.entries()) {
    const out = generate(req.doc, hash);
    const { width, height } = pixelSize(out.scene, req.size);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    drawScene(ctx, out.scene, width, height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const file = `${req.base}_${String(i + 1).padStart(4, "0")}_${hash.slice(0, 12)}.png`;
    bytes += blob.size;
    if (bytes > MAX_BYTES) throw new Error("This batch would be larger than a zip can hold; export fewer or smaller pieces");
    entries.push(await entryFromBlob(file, blob));
    manifest.push({ hash, file, traits: { ...traitsFromResolved(req.doc, out.resolved) } });
    scope.postMessage({ kind: "progress", done: i + 1, total: hashes.length });
  }
  const doc = new TextEncoder().encode(JSON.stringify(req.doc, null, 2));
  const list = new TextEncoder().encode(JSON.stringify({ root: req.root, size: req.size, pieces: manifest }, null, 2));
  return zip([...entries, entryFromBytes("manifest.json", list), entryFromBytes("document.gridloom.json", doc)]);
}

scope.onmessage = (e) => {
  const req = e.data;
  void (async () => {
    try {
      if (req.kind === "census") {
        const hashes = seedSeries(req.root, req.count);
        scope.postMessage({ kind: "census", result: census(req.doc, hashes) });
      } else {
        scope.postMessage({ kind: "batch", zip: await batch(req) });
      }
    } catch (err) {
      scope.postMessage({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    }
  })();
};
