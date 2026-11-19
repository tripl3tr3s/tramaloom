import type { ArtDocument } from "@gridloom/core";
import { useEffect, useRef, useState } from "react";
import { decodeState, encodeState } from "../state/url.ts";

/**
 * Loads doc + hash from the URL fragment once, then mirrors every change back
 * into it (debounced, replaceState), so every output is a shareable link.
 */
export function useUrlSync(
  doc: ArtDocument,
  hash: string,
  onLoad: (doc: ArtDocument | null, hash: string | null) => void,
): boolean {
  const [ready, setReady] = useState(false);
  const onLoadRef = useRef(onLoad);
  const seq = useRef(0);
  onLoadRef.current = onLoad;

  useEffect(() => {
    let cancelled = false;
    decodeState(window.location.hash).then((s) => {
      if (cancelled) return;
      onLoadRef.current(s.doc, s.hash);
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
      encodeState(doc, hash)
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
