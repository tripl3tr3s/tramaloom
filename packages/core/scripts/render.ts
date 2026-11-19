/**
 * Dev preview: render N hashes of the starter document to SVG.
 * Usage: node scripts/render.ts [count] [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, starterDocument, stepHash, toSVG } from "../src/index.ts";

const count = Number(process.argv[2] ?? 9);
const outDir = process.argv[3] ?? "out";
mkdirSync(outDir, { recursive: true });

const root = "7f3a9c0e11d2b4a5968e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3921";
const hashes = Array.from({ length: count }, (_, i) => (i === 0 ? root : stepHash(root, i)));

hashes.forEach((hash) => {
  const out = generate(starterDocument, hash);
  const file = join(outDir, `${hash.slice(0, 10)}.svg`);
  writeFileSync(file, toSVG(out.scene, { size: 800 }));
  const traits = out.resolved
    .filter((r) => r.module === "palette" || r.module === "grid")
    .map((r) => Object.entries(r.values).filter(([k]) => ["palette", "zoneMode", "cols", "rows"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" "))
    .join(" ");
  process.stdout.write(`${file}  ${traits}\n`);
});
