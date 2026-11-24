import type { CensusResult } from "@tramaloom/core";
import { drawInSandbox } from "../sandbox/host.ts";
import type { BatchJob } from "./batch.ts";
import { batchZip } from "./batch.ts";
import type { ToolRequest, ToolResponse } from "./protocol.ts";

export interface ToolRun<T> {
  readonly promise: Promise<T>;
  /** Stops the work immediately; the promise rejects with "cancelled". */
  readonly cancel: () => void;
}

type ResultOf<R extends ToolRequest> = R extends { kind: "census" } ? CensusResult : Blob;

/** One worker per run, so cancelling is just terminating it. */
export function runTool<R extends ToolRequest>(req: R, onProgress?: (done: number, total: number) => void): ToolRun<ResultOf<R>> {
  const w = new Worker(new URL("./toolsWorker.ts", import.meta.url), { type: "module" });
  let settle: ((err: Error) => void) | null = null;
  const promise = new Promise<ResultOf<R>>((resolve, reject) => {
    settle = reject;
    w.onmessage = (e: MessageEvent<ToolResponse>) => {
      const m = e.data;
      if (m.kind === "progress") return onProgress?.(m.done, m.total);
      w.terminate();
      if (m.kind === "error") reject(new Error(m.error));
      else resolve((m.kind === "census" ? m.result : m.zip) as ResultOf<R>);
    };
    w.onmessageerror = () => {
      w.terminate();
      reject(new Error("The worker sent an unreadable result (out of memory?)"));
    };
    w.onerror = (e) => {
      e.preventDefault();
      w.terminate();
      reject(new Error(e.message || "Worker failed"));
    };
  });
  w.postMessage(req);
  return {
    promise,
    cancel: () => {
      w.terminate();
      settle?.(new Error("cancelled"));
    },
  };
}

/**
 * Batch export of a piece with script layers: each seed is drawn in the script sandbox, then
 * painted and zipped here, one at a time. Cancelling stops before the next piece.
 */
export function runScriptBatch(job: BatchJob, onProgress?: (done: number, total: number) => void): ToolRun<Blob> {
  let stopped = false;
  // It runs on the main thread, so it holds less than the worker may: 1 GB of PNGs.
  const promise = batchZip(job, (hash) => drawInSandbox(job.doc, hash), onProgress ?? (() => undefined), () => stopped, 1_000_000_000);
  return {
    promise,
    cancel: () => {
      stopped = true;
    },
  };
}
