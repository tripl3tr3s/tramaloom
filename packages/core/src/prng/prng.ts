/**
 * Deterministic randomness. The contract: the same hash rebuilds the same
 * artwork on any engine, forever. Integer-only arithmetic inside the PRNG.
 */

export type Rng = () => number;
export type SeedState = readonly [number, number, number, number];

const HEX_64 = /^[0-9a-f]{64}$/;
const WARM_UP = 12;

/** Normalise a hash to 64 lowercase hex chars (accepts optional 0x prefix). */
export function normaliseHash(hash: string): string {
  const hex = hash.trim().replace(/^0x/i, "").toLowerCase().padStart(64, "0").slice(-64);
  if (!HEX_64.test(hex)) {
    throw new Error(`Invalid hash: expected hex, got "${hash}"`);
  }
  return hex;
}

/** Fold all 32 bytes into a 128-bit sfc32 state, mixing with imul (not XOR-folding). */
export function seedFromHash(hash: string): SeedState {
  const hex = normaliseHash(hash);
  const s = [0, 0, 0, 0];
  for (let i = 0; i < 8; i++) {
    const w = parseInt(hex.slice(i * 8, i * 8 + 8), 16) >>> 0;
    const k = i % 4;
    s[k] = (Math.imul((s[k] ?? 0) ^ w, 0x9e3779b1) + i) >>> 0;
  }
  return guardZero([s[0] ?? 0, s[1] ?? 0, s[2] ?? 0, s[3] ?? 0]);
}

function guardZero(s: SeedState): SeedState {
  return (s[0] | s[1] | s[2] | s[3]) === 0 ? [s[0], s[1], s[2], 1] : s;
}

/** sfc32: fast, integer-only, identical on every JS engine. Returns [0, 1). */
export function sfc32(state: SeedState): Rng {
  let [a, b, c, d] = state;
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function warm(r: Rng): Rng {
  for (let i = 0; i < WARM_UP; i++) r();
  return r;
}

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Named sub-stream: draws in one domain never shift draws in another.
 * Adding a param or a layer leaves the rest of the edition untouched.
 */
export function streamFromSeed(seed: SeedState, label: string): Rng {
  const k = fnv1a(label);
  const mixed: SeedState = [
    (seed[0] ^ Math.imul(k + 0, 0x9e3779b1)) >>> 0,
    (seed[1] ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0,
    (seed[2] ^ Math.imul(k + 2, 0x9e3779b1)) >>> 0,
    (seed[3] ^ Math.imul(k + 3, 0x9e3779b1)) >>> 0,
  ];
  return warm(sfc32(guardZero(mixed)));
}

export function stream(hash: string, label: string): Rng {
  return streamFromSeed(seedFromHash(hash), label);
}

/** Derive a new 64-hex hash from an rng (used for seed navigation and mutation). */
export function hashFromRng(r: Rng): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += Math.floor(r() * 4294967296).toString(16).padStart(8, "0");
  }
  return out;
}

/** Deterministic "next seed" walk so left/right navigation is reproducible. */
export function stepHash(hash: string, step: number): string {
  return hashFromRng(stream(hash, `step:${step}`));
}
