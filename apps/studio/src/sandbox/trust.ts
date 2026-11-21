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
import { sha256 } from "./sha256.ts";

// v2: SHA-256 digests. (A short non-cryptographic fingerprint could be forged to match approved code.)
const KEY = "gridloom.approvedScripts.v2";
const MAX_REMEMBERED = 300;

// Each script is hashed once; drawing asks often.
const digests = new Map<string, string>();
/** SHA-256 of a script's code: what an approval remembers. */
export function fingerprint(code: string): string {
  const hit = digests.get(code);
  if (hit) return hit;
  const d = sha256(code);
  if (digests.size >= 64) digests.delete(digests.keys().next().value as string);
  digests.set(code, d);
  return d;
}

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x)).slice(-MAX_REMEMBERED) : [];
  } catch {
    return [];
  }
}

let approved: readonly string[] = load();
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version += 1;
  for (const l of listeners) l();
};

// Another tab approved something: pick it up here too.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    approved = load();
    changed();
  });
}

/** The starter script by its exact text; everything else by a remembered approval. */
export const isApproved = (code: string): boolean => code === STARTER_SCRIPT.code || approved.includes(fingerprint(code));

/** Trusts these scripts from now on, in this browser. */
export function approveScripts(codes: readonly string[]): void {
  const fresh = codes.filter((c) => !isApproved(c)).map(fingerprint);
  if (fresh.length === 0) return;
  // Merge with what other tabs saved meanwhile, never overwrite it.
  const merged = [...new Set([...load(), ...approved, ...fresh])].slice(-MAX_REMEMBERED);
  approved = merged;
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Private windows: approvals last for this visit only.
  }
  changed();
}

/** Code of the enabled script layers the person has not approved yet. */
export const unapprovedScripts = (doc: ArtDocument): readonly string[] => [
  ...new Set(doc.layers.flatMap((l) => (l.enabled && l.module === SCRIPT_MODULE && l.script && !isApproved(l.script.code) ? [l.script.code] : []))),
];

/** Code of every script layer not approved yet, hidden ones included: what a minted page or saved file would carry. */
export const unapprovedCode = (doc: ArtDocument): readonly string[] => [
  ...new Set(doc.layers.flatMap((l) => (l.module === SCRIPT_MODULE && l.script && !isApproved(l.script.code) ? [l.script.code] : []))),
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
