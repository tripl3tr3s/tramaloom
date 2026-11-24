import { checkCases, checkPayload } from "@tramaloom/core";

declare global {
  interface Window {
    /** Read by the Playwright determinism test. */
    __tramaloomCheck?: Readonly<Record<string, string>>;
    __tramaloomCheckError?: string;
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const entries: [string, string][] = [];
  for (const c of checkCases()) entries.push([c.name, await sha256(checkPayload(c))]);
  const results = Object.fromEntries(entries);
  const out = document.getElementById("out");
  if (out) {
    out.className = "ok";
    out.textContent = [`${navigator.userAgent}`, "", ...entries.map(([k, v]) => `${k.padEnd(14)} ${v}`)].join("\n");
  }
  window.__tramaloomCheck = results;
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  window.__tramaloomCheckError = msg;
  const out = document.getElementById("out");
  if (out) out.textContent = `check failed: ${msg}`;
});
