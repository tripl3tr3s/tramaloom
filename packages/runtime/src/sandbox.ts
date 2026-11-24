/**
 * The script sandbox's worker: the whole engine plus the script compiler. The studio runs it
 * from a blob URL inside a sandboxed iframe (an opaque origin with a strict CSP), so the code
 * it runs cannot reach the studio's storage or the network. Built to dist/sandbox.js.
 */
import { generate, setScriptRunner, toDrawing } from "@tramaloom/core";
import { compileScript, errorOf, scriptRunner } from "./compile.ts";
import type { SandboxRequest, SandboxResponse } from "./sandboxProtocol.ts";

setScriptRunner(scriptRunner);

interface WorkerScope {
  onmessage: ((e: MessageEvent<SandboxRequest>) => void) | null;
  postMessage(msg: string): void;
}
const scope = self as unknown as WorkerScope;
// One JSON string per answer: the sandbox page checks its size before passing it on.
const answer = (msg: SandboxResponse): void => scope.postMessage(JSON.stringify(msg));

scope.onmessage = (e) => {
  const req = e.data;
  try {
    if (req.op === "compile") {
      const c = compileScript(req.code);
      // Plain data only: functions and other non-JSON values drop out here.
      answer({ id: req.id, ok: true, op: "compile", label: c.label, params: JSON.parse(JSON.stringify(c.params ?? {})) });
    } else {
      const out = generate(req.doc, req.hash);
      answer({ id: req.id, ok: true, op: "draw", resolved: out.resolved, drawing: toDrawing(out.scene) });
    }
  } catch (err) {
    const e2 = errorOf(err);
    answer({ id: req.id, ok: false, error: e2.message, line: e2.line });
  }
};
