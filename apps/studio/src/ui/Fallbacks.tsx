import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

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

export function Unsupported({ missing }: { readonly missing: readonly string[] }) {
  return (
    <main className={page}>
      <div className={card}>
        <h1 className="text-base font-semibold text-white">This browser is too old for Gridloom</h1>
        <p>Gridloom needs a recent Chrome, Edge or Firefox, or Safari 16.4 or later. Updating the browser is enough; nothing to install.</p>
        <p className="text-xs text-zinc-500">Missing: {missing.join(", ")}.</p>
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
          <h1 className="text-base font-semibold text-white">Something broke</h1>
          <p>Your piece is safe: it is stored in this page's address. Reloading usually fixes it. If it keeps happening, copy the link so the piece is not lost, then start fresh.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className={btn} onClick={copy}>
              Copy link to this piece
            </button>
            <button type="button" className={btn} onClick={() => window.location.assign(window.location.pathname)}>
              Start fresh
            </button>
          </div>
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer">Error details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono">{error.message}</pre>
          </details>
        </div>
      </main>
    );
  }
}
