import { hasScripts } from "@tramaloom/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { translate, useLang } from "../i18n/i18n.tsx";
import { drawInSandbox } from "../sandbox/host.ts";
import { drawable, useTrustVersion } from "../sandbox/trust.ts";
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
  const trust = useTrustVersion();
  const { lang } = useLang();
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  });
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
      setState({ jobs: batch.jobs, keys: batch.keys, urls, busy: false, error: failed ? translate(langRef.current, "thumbs.failed") : null });
    };
    w.onerror = (e) => {
      e.preventDefault();
      setState((s) => ({ ...s, busy: false, error: translate(langRef.current, "thumbs.unavailable") }));
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
    const px = Math.round(size * (window.devicePixelRatio || 1));
    // Script layers whose code is not approved yet are left out.
    const allowed = jobs.map((j) => ({ ...j, doc: drawable(j.doc) }));
    if (!allowed.some((j) => hasScripts(j.doc))) {
      workerRef.current?.postMessage({ id, jobs: allowed, size: px } satisfies ThumbRequest);
      return;
    }
    // Script layers are drawn in the sandbox first, one job at a time.
    void (async () => {
      const drawn: ThumbJob[] = [];
      for (const job of allowed) {
        if (latest.current !== id) return; // superseded
        if (!hasScripts(job.doc)) drawn.push(job);
        else {
          const drawing = await drawInSandbox(job.doc, job.hash).catch(() => null);
          drawn.push(drawing ? { ...job, drawing } : job); // without a drawing the worker cannot draw it: null
        }
      }
      if (latest.current === id) workerRef.current?.postMessage({ id, jobs: drawn, size: px } satisfies ThumbRequest);
    })();
  }, [jobs, size, trust]);

  const fresh = state.jobs === jobs;
  const byKey = new Map(state.keys.map((k, i) => [k, state.urls[i] ?? null] as const));
  const urls = fresh ? state.urls : keyList.map((k) => byKey.get(k) ?? null);
  return { urls, fresh, busy: state.busy || !fresh, error: state.error };
}
