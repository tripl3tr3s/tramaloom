import { drawScene, generate, pixelSize } from "@gridloom/core";
import type { ThumbJob, ThumbRequest, ThumbResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((e: MessageEvent<ThumbRequest>) => void) | null;
  postMessage(msg: ThumbResponse): void;
}
const scope = self as unknown as WorkerScope;

// Newest request id. onmessage runs between the awaits below, so a running
// batch sees a newer request arrive and stops early.
let newest = 0;

async function render(job: ThumbJob, size: number): Promise<Blob | null> {
  try {
    const scene = job.drawing ?? generate(job.doc, job.hash).scene;
    const { width, height } = pixelSize(scene, size);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawScene(ctx, scene, width, height);
    return await canvas.convertToBlob({ type: "image/png" });
  } catch {
    return null;
  }
}

scope.onmessage = (e) => {
  const { id, jobs, size } = e.data;
  newest = id;
  void (async () => {
    const images: (Blob | null)[] = [];
    try {
      for (const job of jobs) {
        if (newest !== id) return; // superseded: the newer batch will answer
        images.push(await render(job, size));
      }
    } catch {
      // Fall through and answer with whatever finished; missing entries are null.
    }
    if (newest === id) scope.postMessage({ id, images: jobs.map((_, i) => images[i] ?? null) });
  })();
};
