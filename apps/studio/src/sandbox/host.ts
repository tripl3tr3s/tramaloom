/**
 * The studio's side of the script sandbox (public/sandbox.html). Script layers are only ever
 * run there: an iframe with an opaque origin and a CSP that blocks the network, running the
 * engine (from @gridloom/runtime) in a Worker. Requests go one at a time; one that runs too
 * long gets its worker restarted. Everything that comes back is untrusted and checked here.
 */
import type { ArtDocument, Drawing } from "@gridloom/core";
import { checkDrawing } from "@gridloom/core";
import sandboxSource from "@gridloom/runtime/sandbox.js?raw";
import type { SandboxRequest, SandboxResponse } from "@gridloom/runtime/sandboxProtocol";
import { unapprovedScripts } from "./trust.ts";

/** A script failed: its message, and the script line when the browser reports one. */
export class SandboxError extends Error {
  readonly line: number | null;
  constructor(message: string, line: number | null = null) {
    super(message);
    this.name = "SandboxError";
    this.line = line;
  }
}

/** How long one request may run before its worker is stopped. */
export const COMPILE_TIMEOUT_MS = 3000;
export const DRAW_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 10_000;
const SANDBOX_URL: string = typeof import.meta.env["VITE_SANDBOX_URL"] === "string" && import.meta.env["VITE_SANDBOX_URL"] ? import.meta.env["VITE_SANDBOX_URL"] : "sandbox.html";

type NewJob = { readonly op: "compile"; readonly code: string } | { readonly op: "draw"; readonly doc: ArtDocument; readonly hash: string };
type Ok = Extract<SandboxResponse, { ok: true }>;

interface Pending {
  readonly req: SandboxRequest;
  /** The scripts this request runs: a worker only ever runs one set, so one document's code cannot tamper with another's. */
  readonly scripts: string;
  readonly timeoutMs: number;
  readonly resolve: (r: Ok) => void;
  readonly reject: (e: Error) => void;
}

class SandboxHost {
  private readonly frame: HTMLIFrameElement;
  private readonly ready: Promise<void>;
  private readonly queue: Pending[] = [];
  private current: { readonly job: Pending; readonly timer: ReturnType<typeof setTimeout> } | null = null;
  private nextId = 1;
  private onReady: (() => void) | null = null;
  private onFail: ((e: Error) => void) | null = null;

  constructor() {
    this.frame = document.createElement("iframe");
    this.frame.setAttribute("sandbox", "allow-scripts");
    this.frame.setAttribute("aria-hidden", "true");
    this.frame.tabIndex = -1;
    this.frame.title = "Script sandbox";
    this.frame.hidden = true;
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SandboxError("The script sandbox did not start")), START_TIMEOUT_MS);
      this.onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      this.onFail = (e) => {
        clearTimeout(timer);
        reject(e);
      };
    });
    // Never an unhandled rejection: each request reports the failure itself.
    this.ready.catch(() => undefined);
    window.addEventListener("message", this.onMessage);
    // Same origin by default; a deployment can serve the sandbox from its own origin (VITE_SANDBOX_URL),
    // which also gives it its own browser process.
    this.frame.src = new URL(SANDBOX_URL, document.baseURI).href;
    document.body.append(this.frame);
  }

  private workerScripts: string | null = null;
  /** Scripts that ran out of time or crashed: they fail at once until edited, instead of blocking the queue again. */
  private readonly stopped = new Set<string>();

  run(job: NewJob, timeoutMs: number): Promise<Ok> {
    const req = { ...job, id: this.nextId++ } as SandboxRequest;
    const codes = job.op === "compile" ? [job.code] : job.doc.layers.flatMap((l) => (l.enabled && l.script ? [l.script.code] : []));
    if (codes.some((c) => this.stopped.has(c))) {
      return Promise.reject(new SandboxError("This script was stopped earlier (too slow, or it crashed). Change its code to try again."));
    }
    const scripts = JSON.stringify(codes);
    return this.ready.then(
      () =>
        new Promise<Ok>((resolve, reject) => {
          this.queue.push({ req, scripts, timeoutMs, resolve, reject });
          this.pump();
        }),
    );
  }

  /** Remembers a misbehaving script so it fails fast from now on. */
  private stop(job: Pending): void {
    for (const code of JSON.parse(job.scripts) as string[]) this.stopped.add(code);
  }

  get started(): Promise<void> {
    return this.ready;
  }

  dispose(): void {
    window.removeEventListener("message", this.onMessage);
    this.frame.remove();
  }

  private post(msg: unknown): void {
    this.frame.contentWindow?.postMessage(msg, "*");
  }

  private pump(): void {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    if (job.scripts !== this.workerScripts) {
      // A fresh worker for different scripts: nothing an earlier script changed survives.
      this.post({ kind: "reset" });
      this.workerScripts = job.scripts;
    }
    const timer = setTimeout(() => {
      this.post({ kind: "reset" });
      this.stop(job);
      this.finish(job, new SandboxError(`The script ran for more than ${Math.round(job.timeoutMs / 1000)} seconds and was stopped. Is there a loop that never ends?`));
    }, job.timeoutMs);
    this.current = { job, timer };
    this.post({ kind: "run", req: job.req });
  }

  private finish(job: Pending, result: Ok | Error): void {
    if (this.current?.job !== job) return;
    clearTimeout(this.current.timer);
    this.current = null;
    if (result instanceof Error) job.reject(result);
    else job.resolve(result);
    this.pump();
  }

  private readonly onMessage = (e: MessageEvent): void => {
    if (e.source !== this.frame.contentWindow) return;
    const msg: unknown = e.data;
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as { kind?: unknown; id?: unknown; data?: unknown; error?: unknown };
    switch (m.kind) {
      case "loaded":
        this.post({ kind: "init", source: sandboxSource });
        return;
      case "ready":
        this.onReady?.();
        return;
      case "failed":
        this.onFail?.(new SandboxError(`The script sandbox could not start: ${String(m.error)}`));
        return;
      case "crash": {
        // The page already restarted its worker.
        const job = this.current?.job;
        if (!job || m.id !== job.req.id) return;
        this.stop(job);
        this.finish(job, new SandboxError(typeof m.error === "string" ? m.error.slice(0, 500) : "The script sandbox stopped"));
        return;
      }
      case "result": {
        const job = this.current?.job;
        if (!job || m.id !== job.req.id || typeof m.data !== "string") return;
        let data: Partial<SandboxResponse> | null = null;
        try {
          data = JSON.parse(m.data) as Partial<SandboxResponse> | null;
        } catch {
          this.finish(job, new SandboxError("The script sandbox answered something unreadable"));
          return;
        }
        if (typeof data !== "object" || data === null || data.id !== job.req.id) {
          this.finish(job, new SandboxError("The script sandbox answered something else"));
          return;
        }
        if (data.ok === true) this.finish(job, data as Ok);
        else {
          const fail = data as { error?: unknown; line?: unknown };
          const line = typeof fail.line === "number" && Number.isInteger(fail.line) && fail.line > 0 ? fail.line : null;
          this.finish(job, new SandboxError(typeof fail.error === "string" ? fail.error.slice(0, 500) : "The script failed", line));
        }
      }
    }
  };
}

let host: SandboxHost | null = null;
const sandbox = (): SandboxHost => {
  if (!host) {
    const created = new SandboxHost();
    host = created;
    // A sandbox that failed to start is replaced on the next request.
    created.started.catch(() => {
      if (host === created) host = null;
      created.dispose();
    });
  }
  return host;
};

/** Runs a script's top level: its label and the params it declares (still to be validated). */
export async function compileInSandbox(code: string): Promise<{ readonly label: string; readonly params: unknown }> {
  const r = await sandbox().run({ op: "compile", code }, COMPILE_TIMEOUT_MS);
  if (r.op !== "compile") throw new SandboxError("The script sandbox answered something else");
  return { label: typeof r.label === "string" ? r.label.trim().slice(0, 40) || "Script" : "Script", params: r.params };
}

/** Draws a document that has script layers. The drawing is checked before it is returned. */
export async function drawInSandbox(doc: ArtDocument, hash: string): Promise<Drawing> {
  // Backstop for the consent prompt: callers draw drawable(doc), so this should never trigger.
  if (unapprovedScripts(doc).length > 0) throw new SandboxError("This piece's code has not been approved to run");
  const r = await sandbox().run({ op: "draw", doc, hash }, DRAW_TIMEOUT_MS);
  if (r.op !== "draw") throw new SandboxError("The script sandbox answered something else");
  try {
    return checkDrawing(r.drawing);
  } catch (err) {
    throw new SandboxError(err instanceof Error ? err.message : String(err));
  }
}
