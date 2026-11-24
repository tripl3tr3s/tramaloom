import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, entryFromBlob, entryFromBytes, zip } from "../src/render/zip.ts";
import { safeEntryName } from "../src/render/zip.ts";

const hasUnzip = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes the expected structure", async () => {
    const bytes = new Uint8Array(await zip([entryFromBytes("a.txt", new TextEncoder().encode("hi"))]).arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(1);
  });

  it.skipIf(!hasUnzip)("produces an archive that unzip accepts byte for byte", async () => {
    const files = [
      await entryFromBlob("one.png", new Blob([Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) & 255)])),
      entryFromBytes("two.txt", new TextEncoder().encode("tramaloom")),
    ];
    const dir = mkdtempSync(join(tmpdir(), "tramaloom-zip-"));
    const path = join(dir, "out.zip");
    writeFileSync(path, new Uint8Array(await zip(files).arrayBuffer()));
    expect(execFileSync("unzip", ["-tq", path]).toString()).toMatch(/No errors/);
    expect(execFileSync("unzip", ["-p", path, "two.txt"]).toString()).toBe("tramaloom");
    expect(execFileSync("unzip", ["-l", path]).toString()).toMatch(/1980-01-01/);
  });
});

describe("safeEntryName", () => {
  it("keeps flat file names and refuses folders, parent paths and control characters", () => {
    expect(safeEntryName("piece-pen1-1d3557.svg")).toBe("piece-pen1-1d3557.svg");
    for (const bad of ["../x.svg", "a/b.svg", "a\\b.svg", "x..svg", "..", "a\nb.svg", ""]) expect(() => safeEntryName(bad), bad).toThrow(/Unsafe/);
  });
});
