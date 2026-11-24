import type { ArtDocument, ResolvedLayer } from "@tramaloom/core";
import { hasScripts } from "@tramaloom/core";
import { errorText } from "../i18n/errors.ts";
import type { Vars } from "../i18n/i18n.tsx";
import { translate, useLang } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { drawInSandbox, SandboxError } from "../sandbox/host.ts";
import { drawable, useTrustVersion } from "../sandbox/trust.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RenderRequest, RenderResponse } from "./protocol.ts";

export interface RenderInfo {
  readonly resolved: readonly ResolvedLayer[];
  readonly ms: number;
  readonly cells: number;
  readonly items: number;
  readonly error: string | null;
}

/** Longest a single paint may take before the render worker is replaced. */
const RENDER_TIMEOUT_MS = 15_000;

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
  // Failures arrive from long-lived worker callbacks: they read the language at that moment.
  const { lang } = useLang();
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  });
  const say = (key: MessageKey, vars?: Vars) => translate(langRef.current, key, vars);
  const trust = useTrustVersion();
  const workerRef = useRef<Worker | null>(null);
  const busy = useRef(false);
  const pending = useRef<Job | null>(null);
  const latest = useRef<Job | null>(null);
  const nextId = useRef(0);
  // A drawing that never finishes painting (too heavy) must not freeze the view for good:
  // the worker is replaced, and the job that hung is not sent again on its own.
  const [generation, setGeneration] = useState(0);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hung = useRef<Job | null>(null);
  const disarm = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };
  const post = (worker: Worker, job: Job, req: RenderRequest) => {
    disarm();
    watchdog.current = setTimeout(() => {
      if (workerRef.current !== worker) return;
      hung.current = job;
      setInfo((prev) => ({ ...prev, error: say("render.tooLong") }));
      setGeneration((g) => g + 1);
    }, RENDER_TIMEOUT_MS);
    worker.postMessage(req);
  };

  const send = (job: Job) => {
    const worker = workerRef.current;
    if (!worker) return;
    if (busy.current) {
      pending.current = job;
      return;
    }
    busy.current = true;
    const id = nextId.current++;
    if (!hasScripts(job.doc)) {
      post(worker, job, { ...job, id } satisfies RenderRequest);
      return;
    }
    // Script layers are drawn in the sandbox; the render worker only paints the result.
    drawInSandbox(job.doc, job.hash).then(
      (drawing) => {
        if (workerRef.current === worker) post(worker, job, { ...job, id, drawing } satisfies RenderRequest);
      },
      (err: unknown) => {
        if (workerRef.current !== worker) return;
        failRef.current(scriptErrorText(err, say));
      },
    );
  };
  const failRef = useRef<(msg: string) => void>(() => undefined);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    busy.current = false;
    pending.current = null;

    const drainPending = () => {
      disarm();
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
    failRef.current = fail;
    worker.onerror = (e) => {
      e.preventDefault();
      fail(say("render.workerFailed", { error: e.message || say("render.couldNotLoad") }));
    };
    worker.onmessageerror = () => fail(say("render.unreadable"));

    // Re-issue the newest job on a fresh worker (StrictMode remount, hot reload), unless it is the one that hung.
    if (latest.current && latest.current !== hung.current) sendRef.current(latest.current);

    return () => {
      disarm();
      worker.terminate();
      workerRef.current = null;
      busy.current = false;
      pending.current = null;
    };
    // disarm only touches refs; `generation` changes when the watchdog replaces the worker.
  }, [canvasRef, generation]);

  useEffect(() => {
    if (box.width < 1 || box.height < 1) return;
    const dpr = window.devicePixelRatio || 1;
    // Script layers whose code is not approved yet are left out.
    const job: Job = {
      doc: drawable(doc),
      hash,
      boxWidth: Math.floor(box.width * dpr),
      boxHeight: Math.floor(box.height * dpr),
    };
    latest.current = job;
    sendRef.current(job);
  }, [doc, hash, box.width, box.height, trust]);

  return info;
}

/** "Script, line 5: x is not defined" for the error banner. */
export const scriptErrorText = (err: unknown, t: (key: MessageKey, vars?: Vars) => string): string => {
  const error = errorText(err, t);
  return err instanceof SandboxError && err.line ? t("render.scriptLine", { line: err.line, error }) : t("render.script", { error });
};
