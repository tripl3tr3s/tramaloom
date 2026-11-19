import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ThumbJob, ThumbRequest, ThumbResponse } from "./protocol.ts";

export interface Thumbnails {
  /** Object URLs in job order; null while pending or when a job failed. */
  readonly urls: readonly (string | null)[];
  /** True once `urls` were rendered for exactly the current jobs (not carried over). */
  readonly fresh: boolean;
  readonly busy: boolean;
  readonly error: string | null;
}

interface Internal {
  readonly jobs: readonly ThumbJob[] | null;
  readonly keys: readonly string[];
  readonly urls: readonly (string | null)[];
  readonly busy: boolean;
  readonly error: string | null;
}

/**
 * Renders small previews in a dedicated worker so the main canvas never waits.
 * Latest wins: the worker abandons a batch as soon as a newer one arrives.
 * `jobs` must be memoised by the caller. Pass `keys` (one per job) to carry
 * finished images over to the next batch by identity instead of by position.
 */
export function useThumbnails(jobs: readonly ThumbJob[], size: number, keys?: readonly string[]): Thumbnails {
  const [state, setState] = useState<Internal>({ jobs: null, keys: [], urls: [], busy: true, error: null });
  const workerRef = useRef<Worker | null>(null);
  const latest = useRef(0);
  const batches = useRef(new Map<number, { jobs: readonly ThumbJob[]; keys: readonly string[] }>());
  const owned = useRef<string[]>([]);
  const revokeLater = (urls: readonly string[]) => {
    // After React has committed the replacement images.
    if (urls.length) setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1000);
  };

  useEffect(() => {
    const w = new Worker(new URL("./thumbWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<ThumbResponse>) => {
      const { id, images } = e.data;
      const batch = batches.current.get(id);
      batches.current.delete(id);
      if (id !== latest.current || !batch) return; // superseded
      const urls = images.map((b) => (b ? URL.createObjectURL(b) : null));
      revokeLater(owned.current);
      owned.current = urls.filter((u): u is string => u !== null);
      const failed = images.length > 0 && images.every((b) => b === null);
      setState({ jobs: batch.jobs, keys: batch.keys, urls, busy: false, error: failed ? "Previews could not be rendered" : null });
    };
    w.onerror = (e) => {
      e.preventDefault();
      setState((s) => ({ ...s, busy: false, error: "Previews are unavailable in this browser" }));
    };
    return () => {
      w.terminate();
      workerRef.current = null;
      batches.current.clear();
      revokeLater(owned.current);
      owned.current = [];
    };
  }, []);

  const keyList = keys ?? jobs.map((_, i) => String(i));
  const keyRef = useRef(keyList);
  useLayoutEffect(() => {
    keyRef.current = keyList;
  });

  useEffect(() => {
    const id = ++latest.current;
    const k = keyRef.current;
    // Superseded batches are never answered, so forget them here.
    [...batches.current.keys()].filter((old) => old < id).forEach((old) => batches.current.delete(old));
    batches.current.set(id, { jobs, keys: k });
    setState((s) => ({ ...s, busy: true }));
    workerRef.current?.postMessage({ id, jobs, size: Math.round(size * (window.devicePixelRatio || 1)) } satisfies ThumbRequest);
  }, [jobs, size]);

  const fresh = state.jobs === jobs;
  const byKey = new Map(state.keys.map((k, i) => [k, state.urls[i] ?? null] as const));
  const urls = fresh ? state.urls : keyList.map((k) => byKey.get(k) ?? null);
  return { urls, fresh, busy: state.busy || !fresh, error: state.error };
}
