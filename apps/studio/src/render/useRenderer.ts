import type { ArtDocument, ResolvedLayer } from "@gridloom/core";
import { useEffect, useRef, useState } from "react";
import type { RenderRequest, RenderResponse } from "./protocol.ts";

export interface RenderInfo {
  readonly resolved: readonly ResolvedLayer[];
  readonly ms: number;
  readonly cells: number;
  readonly items: number;
  readonly error: string | null;
}

const EMPTY: RenderInfo = { resolved: [], ms: 0, cells: 0, items: 0, error: null };

type Job = Omit<RenderRequest, "id">;

/**
 * Renders off the main thread. At most one request is in flight; while busy,
 * only the newest job is kept (latest wins, no queue build-up). The latest job
 * is remembered so a recreated worker picks up where the old one stopped.
 */
export function useRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  doc: ArtDocument,
  hash: string,
  box: { readonly width: number; readonly height: number },
): RenderInfo {
  const [info, setInfo] = useState<RenderInfo>(EMPTY);
  const workerRef = useRef<Worker | null>(null);
  const busy = useRef(false);
  const pending = useRef<Job | null>(null);
  const latest = useRef<Job | null>(null);
  const nextId = useRef(0);

  const send = (job: Job) => {
    const worker = workerRef.current;
    if (!worker) return;
    if (busy.current) {
      pending.current = job;
      return;
    }
    busy.current = true;
    worker.postMessage({ ...job, id: nextId.current++ } satisfies RenderRequest);
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    busy.current = false;
    pending.current = null;

    const drainPending = () => {
      busy.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) sendRef.current(next);
    };

    worker.onmessage = (e: MessageEvent<RenderResponse>) => {
      const res = e.data;
      if (res.ok) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("bitmaprenderer");
        if (canvas && ctx) {
          canvas.width = res.width;
          canvas.height = res.height;
          const dpr = window.devicePixelRatio || 1;
          canvas.style.width = `${res.width / dpr}px`;
          canvas.style.height = `${res.height / dpr}px`;
          ctx.transferFromImageBitmap(res.bitmap);
        } else {
          res.bitmap.close();
        }
        setInfo({ resolved: res.resolved, ms: res.ms, cells: res.cells, items: res.items, error: null });
      } else {
        setInfo((prev) => ({ ...prev, error: res.error }));
      }
      drainPending();
    };
    const fail = (msg: string) => {
      setInfo((prev) => ({ ...prev, error: msg }));
      drainPending();
    };
    worker.onerror = (e) => {
      e.preventDefault();
      fail(`Render worker failed: ${e.message || "could not load"}. Try reloading the page.`);
    };
    worker.onmessageerror = () => fail("Render worker sent an unreadable message");

    // Re-issue the newest job on a fresh worker (StrictMode remount, hot reload).
    if (latest.current) sendRef.current(latest.current);

    return () => {
      worker.terminate();
      workerRef.current = null;
      busy.current = false;
      pending.current = null;
    };
  }, [canvasRef]);

  useEffect(() => {
    if (box.width < 1 || box.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const job: Job = {
      doc,
      hash,
      boxWidth: Math.floor(box.width * dpr),
      boxHeight: Math.floor(box.height * dpr),
    };
    latest.current = job;
    sendRef.current(job);
  }, [doc, hash, box.width, box.height]);

  return info;
}
