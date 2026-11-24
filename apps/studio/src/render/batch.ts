/**
 * Batch export: many seeds of one piece as PNGs in a zip, with a manifest of their traits.
 * Shared by the tools worker (pieces it can generate itself) and the main thread (pieces with
 * script layers, whose drawings come from the script sandbox one at a time).
 */
import type { ArtDocument, Drawing } from "@tramaloom/core";
import { drawScene, pixelSize, resolveDocument, seedSeries, traitsFromResolved } from "@tramaloom/core";
import type { ZipEntry } from "./zip.ts";
import { entryFromBlob, entryFromBytes, zip } from "./zip.ts";

// A zip without ZIP64 tops out at 4 GB; stop early instead of after rendering everything.
const MAX_BYTES = 3_500_000_000;

export interface BatchJob {
  /** What is drawn (script layers whose code is not approved are already left out). */
  readonly doc: ArtDocument;
  /** The piece as it really is, saved in the zip so the batch can be reproduced. Defaults to doc. */
  readonly record?: ArtDocument;
  readonly root: string;
  readonly count: number;
  readonly size: number;
  readonly base: string;
}

export async function batchZip(
  job: BatchJob,
  drawingFor: (hash: string) => Drawing | Promise<Drawing>,
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean = () => false,
  maxBytes: number = MAX_BYTES,
): Promise<Blob> {
  const hashes = seedSeries(job.root, job.count);
  const entries: ZipEntry[] = [];
  let bytes = 0;
  const manifest: { hash: string; file: string; traits: Record<string, string | number> }[] = [];
  for (const [i, hash] of hashes.entries()) {
    if (cancelled()) throw new Error("cancelled");
    const scene = await drawingFor(hash);
    const { width, height } = pixelSize(scene, job.size);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    drawScene(ctx, scene, width, height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const file = `${job.base}_${String(i + 1).padStart(4, "0")}_${hash.slice(0, 12)}.png`;
    bytes += blob.size;
    if (bytes > maxBytes) throw new Error("This batch would be larger than a zip can hold; export fewer or smaller pieces");
    entries.push(await entryFromBlob(file, blob));
    // Traits come from the settings alone: no drawing, no script needed.
    manifest.push({ hash, file, traits: { ...traitsFromResolved(job.doc, resolveDocument(job.doc, hash)) } });
    onProgress(i + 1, hashes.length);
  }
  const doc = new TextEncoder().encode(JSON.stringify(job.record ?? job.doc, null, 2));
  const list = new TextEncoder().encode(JSON.stringify({ root: job.root, size: job.size, pieces: manifest }, null, 2));
  return zip([...entries, entryFromBytes("manifest.json", list), entryFromBytes("document.tramaloom.json", doc)]);
}
