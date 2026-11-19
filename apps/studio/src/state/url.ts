import type { ArtDocument } from "@gridloom/core";
import { normaliseHash } from "@gridloom/core";
import { parseDocument } from "./schema.ts";

const MAX_COMPRESSED = 64 * 1024;
const MAX_JSON = 512 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inflate with a hard output cap, aborting as soon as it is exceeded (zip-bomb guard). */
async function inflateCapped(bytes: Uint8Array, cap: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  chunks.reduce((offset, c) => {
    out.set(c, offset);
    return offset + c.byteLength;
  }, 0);
  return out;
}

export async function encodeState(doc: ArtDocument, hash: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(doc)), new CompressionStream("deflate-raw"));
  return `d=${toBase64Url(packed)}&h=${hash}`;
}

export interface DecodedState {
  readonly doc: ArtDocument | null;
  readonly hash: string | null;
}

/** Decode a location fragment. Invalid parts come back as null, never throw. */
export async function decodeState(fragment: string): Promise<DecodedState> {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const hash = safeHash(params.get("h"));
  const d = params.get("d");
  if (!d || d.length > MAX_COMPRESSED * 2) return { doc: null, hash };
  try {
    const raw = await inflateCapped(fromBase64Url(d), MAX_JSON);
    if (!raw) return { doc: null, hash };
    return { doc: parseDocument(JSON.parse(new TextDecoder().decode(raw))), hash };
  } catch {
    return { doc: null, hash };
  }
}

function safeHash(h: string | null): string | null {
  if (!h) return null;
  try {
    return normaliseHash(h);
  } catch {
    return null;
  }
}
