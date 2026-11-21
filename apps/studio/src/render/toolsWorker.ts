import { census, generate, seedSeries } from "@gridloom/core";
import { batchZip } from "./batch.ts";
import type { ToolRequest, ToolResponse } from "./protocol.ts";

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToolRequest>) => void) | null;
  postMessage(msg: ToolResponse): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const req = e.data;
  void (async () => {
    try {
      if (req.kind === "census") {
        const hashes = seedSeries(req.root, req.count);
        scope.postMessage({ kind: "census", result: census(req.doc, hashes) });
      } else {
        const zipBlob = await batchZip(req, (hash) => generate(req.doc, hash).scene, (done, total) => scope.postMessage({ kind: "progress", done, total }));
        scope.postMessage({ kind: "batch", zip: zipBlob });
      }
    } catch (err) {
      scope.postMessage({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    }
  })();
};
