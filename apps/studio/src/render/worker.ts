import { drawScene, generate } from "@gridloom/core";
import type { RenderRequest, RenderResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(msg: RenderResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, doc, hash, boxWidth, boxHeight } = e.data;
  try {
    const t0 = performance.now();
    const out = generate(doc, hash);
    const { scene } = out;
    const s = Math.min(boxWidth / scene.width, boxHeight / scene.height);
    const width = Math.max(1, Math.floor(scene.width * s));
    const height = Math.max(1, Math.floor(scene.height * s));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    drawScene(ctx, scene, width, height);
    const bitmap = canvas.transferToImageBitmap();
    scope.postMessage(
      {
        id,
        ok: true,
        bitmap,
        width,
        height,
        resolved: out.resolved,
        ms: performance.now() - t0,
        cells: scene.cells.length,
        items: scene.items.length,
      },
      [bitmap],
    );
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
