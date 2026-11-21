import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import type { Vars } from "../i18n/i18n.tsx";
import { initialLang, translate } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";

const page = "grid min-h-dvh place-items-center bg-zinc-950 p-6 text-zinc-200";
const card = "w-full max-w-md space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-sm leading-relaxed";
const btn = "rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-700";
const primary = "rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-600";

/** Features the studio cannot run without: render workers and compressed share links. */
export function missingFeatures(): readonly string[] {
  const checks: readonly [string, boolean][] = [
    ["Web Workers", typeof Worker !== "undefined"],
    ["OffscreenCanvas", typeof OffscreenCanvas !== "undefined"],
    ["CompressionStream", typeof CompressionStream !== "undefined"],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

// Shown when the studio itself cannot run, outside its language provider: read the saved choice directly.
const tr = (key: MessageKey, vars?: Vars): string => translate(initialLang(), key, vars);

export function Unsupported({ missing }: { readonly missing: readonly string[] }) {
  return (
    <main className={page}>
      <div className={card}>
        <h1 className="text-base font-semibold text-white">{tr("fallback.oldTitle")}</h1>
        <p>{tr("fallback.oldBody")}</p>
        <p className="text-xs text-zinc-500">{tr("fallback.missing", { list: missing.join(", ") })}</p>
      </div>
    </main>
  );
}

interface State {
  readonly error: Error | null;
}

/**
 * Last line of defence: a crash shows this instead of a blank page. The piece
 * lives in the address bar, so the way out is a reload, or a fresh start.
 */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Nothing is sent anywhere: Gridloom has no server. The message is shown below.
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const copy = () => void navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
    return (
      <main className={page}>
        <div className={card}>
          <h1 className="text-base font-semibold text-white">{tr("fallback.brokeTitle")}</h1>
          <p>{tr("fallback.brokeBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => window.location.reload()}>
              {tr("fallback.reload")}
            </button>
            <button type="button" className={btn} onClick={copy}>
              {tr("fallback.copy")}
            </button>
            <button type="button" className={btn} onClick={() => window.location.assign(window.location.pathname)}>
              {tr("fallback.fresh")}
            </button>
          </div>
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer">{tr("fallback.details")}</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{error.message}</pre>
          </details>
        </div>
      </main>
    );
  }
}
