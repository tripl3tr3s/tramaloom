/**
 * Phase 0 spike for user scripts: can a script run, isolated, in every browser?
 * Setup: an app page (its own origin, with a "Library" in IndexedDB) hosts a sandboxed iframe
 * (allow-scripts only, so an opaque origin) with a strict CSP. The iframe runs each script in a
 * Worker made from a blob URL, kills it on a timeout, and passes results back as plain data.
 * Nothing here ships: it only answers whether the design works before Phase 2 builds on it.
 */
import { expect, test } from "@playwright/test";

const APP = "http://tramaloom.test/";
const SECRET = "SECRET-PIECE";

// Runs inside the Worker. Math.random becomes a seeded stream, so scripts that use it stay repeatable.
const RUNNER = `
self.onmessage = (e) => {
  const { code, seed } = e.data;
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = rand;
  Promise.resolve()
    .then(() => new Function("rand", '"use strict";\\n' + code)(rand))
    .then(
      (items) => self.postMessage({ ok: true, items: JSON.parse(JSON.stringify(items ?? null)) }),
      (err) => self.postMessage({ ok: false, error: String((err && err.message) || err) }),
    );
};`;

// The sandboxed iframe: owns the Worker, enforces the timeout, talks only to its parent.
const FRAME_SCRIPT = `
const RUNNER = ${JSON.stringify(RUNNER)};
let worker = null;
let url = null;
const fresh = () => {
  if (worker) worker.terminate();
  url = url || URL.createObjectURL(new Blob([RUNNER], { type: "text/javascript" }));
  worker = new Worker(url);
};
try {
  fresh();
  parent.postMessage({ ready: true }, "*");
} catch (err) {
  parent.postMessage({ ready: false, error: String((err && err.message) || err) }, "*");
}
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const { id, code, seed, timeout } = e.data;
  let done = false;
  const reply = (msg) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    parent.postMessage({ id, ...msg }, "*");
  };
  const timer = setTimeout(() => {
    fresh();
    reply({ ok: false, error: "timeout" });
  }, timeout);
  worker.onmessage = (m) => reply(m.data);
  worker.onerror = (ev) => {
    ev.preventDefault();
    reply({ ok: false, error: ev.message || "error" });
  };
  worker.postMessage({ code, seed });
});`;

const FRAME = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
<script>${FRAME_SCRIPT}</script>`;

const HOST = `<!doctype html><meta charset="utf-8"><title>host</title><body>
<script>
window.secretReady = new Promise((res, rej) => {
  const r = indexedDB.open("tramaloom", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("library");
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const tx = r.result.transaction("library", "readwrite");
    tx.objectStore("library").put(${JSON.stringify(SECRET)}, "k");
    tx.oncomplete = () => res(true);
  };
});
const frame = document.createElement("iframe");
frame.sandbox = "allow-scripts";
frame.srcdoc = ${JSON.stringify(FRAME).replace(/</g, "\\u003c")};
const pending = new Map();
let n = 0;
window.sandboxReady = new Promise((res) => {
  addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow) return;
    if ("ready" in e.data) return res(e.data);
    const done = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (done) done(e.data);
  });
});
document.body.append(frame);
window.runScript = (code, seed = 1, timeout = 1000) =>
  new Promise((res) => {
    const id = ++n;
    pending.set(id, res);
    frame.contentWindow.postMessage({ id, code, seed, timeout }, "*");
  });
</script>`;

interface Result {
  readonly ok: boolean;
  readonly items?: unknown;
  readonly error?: string;
}

test.describe("script sandbox spike", () => {
  let outbound: string[];

  test.beforeEach(async ({ page }) => {
    outbound = [];
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url === APP) return route.fulfill({ contentType: "text/html", body: HOST });
      outbound.push(url);
      return route.fulfill({ contentType: "text/plain", body: SECRET });
    });
    // page.route does not see WebSockets.
    await page.routeWebSocket(/.*/, (ws) => {
      outbound.push(ws.url());
      ws.close();
    });
    await page.goto(APP);
    await page.evaluate(() => (window as unknown as { secretReady: Promise<unknown> }).secretReady);
    const ready = await page.evaluate(() => (window as unknown as { sandboxReady: Promise<{ ready: boolean; error?: string }> }).sandboxReady);
    expect(ready, ready.error).toEqual({ ready: true });
  });

  const run = async (page: import("@playwright/test").Page, code: string, seed = 1, timeout = 1000): Promise<Result> => {
    const { id: _id, ...rest } = await page.evaluate(
      ([c, s, t]) => (window as unknown as { runScript: (c: string, s: number, t: number) => Promise<Result & { id: number }> }).runScript(c, s, t),
      [code, seed, timeout] as const,
    );
    return rest;
  };

  test("a script returns drawing items", async ({ page }) => {
    const r = await run(page, `return [{ type: "circle", cx: 0.5, cy: 0.5, r: 0.25, fill: "#000" }];`);
    expect(r).toEqual({ ok: true, items: [{ type: "circle", cx: 0.5, cy: 0.5, r: 0.25, fill: "#000" }] });
  });

  test("Math.random is seeded: same seed, same output; other seed, other output", async ({ page }) => {
    const code = `return [Math.random(), Math.random(), rand()];`;
    const a = await run(page, code, 7);
    const b = await run(page, code, 7);
    const c = await run(page, code, 8);
    expect(a.ok).toBe(true);
    expect(a.items).toEqual(b.items);
    expect(a.items).not.toEqual(c.items);
  });

  test("an endless loop is stopped, and the sandbox keeps working", async ({ page }) => {
    const t0 = Date.now();
    const r = await run(page, `while (true) {}`, 1, 500);
    expect(r).toEqual({ ok: false, error: "timeout" });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(await run(page, `return 42;`)).toEqual({ ok: true, items: 42 });
  });

  test("errors come back as messages", async ({ page }) => {
    const r = await run(page, `throw new Error("boom")`);
    expect(r).toEqual({ ok: false, error: "boom" });
  });

  test("a script cannot read the app's IndexedDB", async ({ page }) => {
    const r = await run(
      page,
      `return new Promise((res) => {
        try {
          const o = indexedDB.open("tramaloom");
          o.onerror = () => res("blocked: open");
          o.onsuccess = () => {
            try {
              const g = o.result.transaction("library").objectStore("library").get("k");
              g.onsuccess = () => res("read: " + String(g.result));
              g.onerror = () => res("blocked: get");
            } catch (e) { res("blocked: " + e.name); }
          };
        } catch (e) { res("blocked: " + e.name); }
      });`,
    );
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  test("a script cannot reach the network", async ({ page }) => {
    const r = await run(
      page,
      `const tries = [
        () => fetch("${APP}leak?fetch"),
        () => fetch("https://example.com/leak?fetch"),
        () => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open("GET", "${APP}leak?xhr"); x.onload = res; x.onerror = rej; x.send(); }),
        () => { importScripts("${APP}leak?import"); },
        () => { new WebSocket("ws://tramaloom.test/leak"); },
        () => { new EventSource("${APP}leak?sse"); },
      ];
      const out = [];
      for (const t of tries) {
        try { await t(); out.push("reached"); } catch (e) { out.push("blocked"); }
      }
      return out;`.replace(/^/, "return (async () => {").concat("})();"),
    );
    expect(r.ok, r.error).toBe(true);
    // Give anything that slipped through time to arrive.
    await page.waitForTimeout(300);
    expect(outbound).toEqual([]);
  });
});
