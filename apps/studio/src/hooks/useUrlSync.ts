import type { ArtDocument } from "@gridloom/core";
import { ENGINE_VERSION } from "@gridloom/core";
import { useEffect, useRef, useState } from "react";
import { decodeState, encodeState } from "../state/url.ts";

/**
 * Loads doc + hash from the URL fragment once, then mirrors every change back
 * into it (debounced, replaceState), so every output is a shareable link.
 */
export function useUrlSync(
  doc: ArtDocument,
  hash: string,
  onLoad: (doc: ArtDocument | null, hash: string | null, engine: number) => void,
): boolean {
  const [ready, setReady] = useState(false);
  const onLoadRef = useRef(onLoad);
  const seq = useRef(0);
  // What the link held, so an untouched old link keeps saying which engine made it.
  const loaded = useRef<{ doc: ArtDocument | null; hash: string | null; engine: number } | null>(null);
  onLoadRef.current = onLoad;

  useEffect(() => {
    let cancelled = false;
    decodeState(window.location.hash).then((s) => {
      if (cancelled) return;
      loaded.current = s;
      onLoadRef.current(s.doc, s.hash, s.engine);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const mine = ++seq.current;
      const l = loaded.current;
      const untouched = l !== null && l.doc === doc && l.hash === hash;
      encodeState(doc, hash, untouched ? l.engine : ENGINE_VERSION)
        .then((frag) => {
          // A newer encode may have started meanwhile; never let an older one overwrite it.
          if (mine === seq.current) history.replaceState(null, "", `#${frag}`);
        })
        .catch(() => {
          // CompressionStream unavailable: sharing links is disabled, the studio still works.
        });
    }, 250);
    return () => clearTimeout(t);
  }, [doc, hash, ready]);

  return ready;
}
