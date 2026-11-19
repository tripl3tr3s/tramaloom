import type { ArtDocument } from "@gridloom/core";
import { z } from "zod";
import { ArtDocumentSchema, parseDocument } from "./schema.ts";

/** A preset saved by the user in this browser. */
export interface UserPreset {
  readonly id: string;
  readonly name: string;
  readonly doc: ArtDocument;
  readonly hash: string;
  readonly createdAt: number;
}

export const MAX_USER_PRESETS = 500;

const UserPresetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().max(100),
  doc: ArtDocumentSchema,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.number().int().nonnegative(),
});

/**
 * Stored records are external input (another tab, an older version, devtools),
 * so every read is validated. Invalid records are skipped, never thrown.
 */
export function parseUserPreset(input: unknown): UserPreset | null {
  const r = UserPresetSchema.safeParse(input);
  if (!r.success) return null;
  const doc = parseDocument(r.data.doc);
  return doc ? { ...r.data, doc } : null;
}

const DB_NAME = "gridloom";
const STORE = "presets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
    req.onblocked = () => reject(new Error("Library is busy in another tab; close it and try again"));
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

/** Newest first. Unreadable records are ignored. */
export async function listPresets(): Promise<readonly UserPreset[]> {
  const raw = await run("readonly", (s) => s.getAll());
  return raw
    .map(parseUserPreset)
    .filter((p): p is UserPreset => p !== null)
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
}

export async function savePreset(p: UserPreset): Promise<void> {
  const valid = parseUserPreset(p);
  if (!valid) throw new Error("Preset is not valid");
  const db = await open();
  try {
    // Count and write in one transaction, so two tabs cannot both slip past the cap.
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const exists = store.getKey(valid.id);
      const count = store.count();
      let full = false;
      count.onsuccess = () => {
        if (exists.result === undefined && count.result >= MAX_USER_PRESETS) {
          full = true;
          tx.abort();
          return;
        }
        store.put(valid);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(full ? new Error(`Library is full (${MAX_USER_PRESETS} presets)`) : (tx.error ?? new Error("Save aborted")));
      tx.onerror = () => reject(tx.error ?? new Error("Save failed"));
    });
  } finally {
    db.close();
  }
}

export async function deletePreset(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** Random id for a new preset. */
export function presetId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}
