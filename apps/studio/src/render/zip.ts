/**
 * Minimal ZIP writer (stored, no compression). PNGs are already compressed, so
 * deflating them again gains nothing; this keeps the studio dependency-free.
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A file to store. `data` may be a Blob so large images need not sit in memory
 * as arrays (browsers can keep Blobs on disk); crc and size are computed once up front.
 */
export interface ZipEntry {
  readonly name: string;
  readonly data: Blob | Uint8Array;
  readonly crc: number;
  readonly size: number;
}

/** A flat file name: no folders, no "..", no control characters, so unzipping writes only where asked. */
export function safeEntryName(name: string): string {
  if (!name || /[/\\\x00-\x1f\x7f]|^\.\.?$|\.\./.test(name) || name.length > 200) throw new Error(`Unsafe file name in zip: ${JSON.stringify(name.slice(0, 40))}`);
  return name;
}

export const entryFromBytes = (name: string, data: Uint8Array): ZipEntry => ({ name: safeEntryName(name), data, crc: crc32(data), size: data.length });

/** Reads the blob once to checksum it, then keeps only the Blob. */
export async function entryFromBlob(name: string, data: Blob): Promise<ZipEntry> {
  return { name: safeEntryName(name), data, crc: crc32(new Uint8Array(await data.arrayBuffer())), size: data.size };
}

const MAX_ENTRIES = 0xffff;
// Fixed DOS date 1980-01-01 00:00: valid everywhere, and the same bytes on every export.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const MAX_TOTAL = 0xffffffff; // no ZIP64

export function zip(entries: readonly ZipEntry[]): Blob {
  if (entries.length > MAX_ENTRIES) throw new Error("Too many files for one zip");
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const { crc, size } = e;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, e.data as BlobPart);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
    if (offset > MAX_TOTAL) throw new Error("Zip would exceed 4 GB");
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: "application/zip" });
}
