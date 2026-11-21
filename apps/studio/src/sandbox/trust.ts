/**
 * Which script code the person has agreed to run. Code they write, remix or approve in this
 * browser is trusted; code that arrives in a share link, an opened file or an imported Library
 * entry is not drawn until they say so. Until then its script layers are left out of every
 * drawing. The sandbox is the real protection; this is about consent and not surprising anyone.
 */
import type { ArtDocument } from "@gridloom/core";
import { SCRIPT_MODULE } from "@gridloom/core";
import { useSyncExternalStore } from "react";
import { STARTER_SCRIPT } from "../ui/code/starter.ts";

const KEY = "gridloom.approvedScripts";
const MAX_REMEMBERED = 300;

/** A short fingerprint of a script's code (cyrb53). Not security: the sandbox is. */
export function fingerprint(code: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < code.length; i++) {
    const c = code.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(-MAX_REMEMBERED) : [];
  } catch {
    return [];
  }
}

let approved: readonly string[] = [fingerprint(STARTER_SCRIPT.code), ...load()];
let version = 0;
const listeners = new Set<() => void>();

export const isApproved = (code: string): boolean => approved.includes(fingerprint(code));

/** Trusts these scripts from now on, in this browser. */
export function approveScripts(codes: readonly string[]): void {
  const fresh = codes.map(fingerprint).filter((f) => !approved.includes(f));
  if (fresh.length === 0) return;
  approved = [...approved, ...fresh].slice(-MAX_REMEMBERED);
  try {
    localStorage.setItem(KEY, JSON.stringify(approved));
  } catch {
    // Private windows: approvals last for this visit only.
  }
  version += 1;
  for (const l of listeners) l();
}

/** Code of the enabled script layers the person has not approved yet. */
export const unapprovedScripts = (doc: ArtDocument): readonly string[] => [
  ...new Set(doc.layers.flatMap((l) => (l.enabled && l.module === SCRIPT_MODULE && l.script && !isApproved(l.script.code) ? [l.script.code] : []))),
];

/** The document as it may be drawn: script layers with unapproved code are left out. */
export function drawable(doc: ArtDocument): ArtDocument {
  if (unapprovedScripts(doc).length === 0) return doc;
  return { ...doc, layers: doc.layers.map((l) => (l.module === SCRIPT_MODULE && l.script && !isApproved(l.script.code) ? { ...l, enabled: false } : l)) };
}

/** Changes whenever a script is approved, so drawings that left it out redraw. */
export const useTrustVersion = (): number =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
