import type { Drawing, ResolvedLayer } from "@tramaloom/core";
import { drawScene, generate, resolveDocument } from "@tramaloom/core";
import type { RenderRequest, RenderResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(msg: RenderResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, doc, hash, boxWidth, boxHeight, drawing } = e.data;
  try {
    const t0 = performance.now();
    // A script document arrives drawn by the sandbox; its settings resolve here without its code.
    let scene: Drawing;
    let resolved: readonly ResolvedLayer[];
    let cells = 0;
    if (drawing) {
      scene = drawing;
      resolved = resolveDocument(doc, hash);
    } else {
      const out = generate(doc, hash);
      scene = out.scene;
      resolved = out.resolved;
      cells = out.scene.cells.length;
    }
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
        resolved,
        ms: performance.now() - t0,
        cells,
        items: scene.items.length,
      },
      [bitmap],
    );
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
