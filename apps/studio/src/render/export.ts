import type { ArtDocument, Drawing } from "@gridloom/core";
import { drawScene, generate, hasScripts, pixelSize, toSVG } from "@gridloom/core";
import { drawInSandbox } from "../sandbox/host.ts";

/** The piece's drawing: from the script sandbox when it has script layers, else generated here. */
export const drawingFor = (doc: ArtDocument, hash: string): Promise<Drawing> =>
  hasScripts(doc) ? drawInSandbox(doc, hash) : Promise.resolve(generate(doc, hash).scene);

export const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gridloom";

const fileBase = (doc: ArtDocument, hash: string): string => `${slug(doc.name)}_${hash.slice(0, 10)}`;

export function download(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Re-render at the requested size from the seed. Never upscales a screen buffer. */
export async function exportPNG(doc: ArtDocument, hash: string, longSide: number): Promise<void> {
  const scene = await drawingFor(doc, hash);
  const { width, height } = pixelSize(scene, longSide);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  drawScene(ctx, scene, width, height);
  download(await canvas.convertToBlob({ type: "image/png" }), `${fileBase(doc, hash)}_${longSide}.png`);
}

export async function exportSVG(doc: ArtDocument, hash: string): Promise<void> {
  const scene = await drawingFor(doc, hash);
  download(new Blob([toSVG(scene, { size: 2000 })], { type: "image/svg+xml" }), `${fileBase(doc, hash)}.svg`);
}

export function exportJSON(doc: ArtDocument): void {
  download(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }), `${slug(doc.name)}.gridloom.json`);
}
