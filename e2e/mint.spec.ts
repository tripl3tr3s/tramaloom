import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { builtinPresets, computeTraits, generate, seedSeries, stepHash, toSVG } from "../packages/core/src/index.ts";
import { assembleMint } from "../packages/runtime/src/assemble.ts";

/**
 * The exported index.html must work with no network at all, fire its done
 * signal, and draw exactly what the studio draws for the same seed.
 */
const runtime = readFileSync(join(import.meta.dirname, "../packages/runtime/dist/runtime.js"), "utf8");
const dir = mkdtempSync(join(tmpdir(), "gridloom-mint-"));
const meta = { title: "Mint test", artist: "", licence: "CC0 1.0", captureWidth: 1000, captureHeight: 1000 };
declare global {
  interface Window {
    doneCount?: number;
  }
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const presets = builtinPresets.filter((p) => ["breadboard", "quilt", "totem"].includes(p.id));

async function openOffline(page: Page, file: string, query: string): Promise<string[]> {
  const requests: string[] = [];
  await page.context().setOffline(true);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    requests.push(url);
    return route.abort();
  });
  await page.goto(`${pathToFileURL(file).href}${query}`);
  await page.waitForFunction(() => window.rendered instanceof HTMLCanvasElement, undefined, { timeout: 20_000 });
  return requests;
}

for (const p of presets) {
  test(`${p.id}: offline, done signal, features and display list match Node`, async ({ page }) => {
    const file = join(dir, `${p.id}.html`);
    writeFileSync(file, assembleMint(runtime, p.doc, meta));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const requests = await openOffline(page, file, `?hash=0x${p.hash}`);

    const result = await page.evaluate(() => ({ features: window.$features, svg: window.gridloom?.svg() ?? "", hash: window.gridloom?.hash }));
    expect(requests, "network requests").toEqual([]);
    expect(errors).toEqual([]);
    expect(result.hash).toBe(p.hash);
    expect(result.features).toEqual(computeTraits(p.doc, p.hash));
    expect(sha(result.svg)).toBe(sha(toSVG(generate(p.doc, p.hash).scene)));

    // A-B-A through the render entry point: no state leaks between renders.
    const [a, b] = seedSeries(stepHash(p.hash, 99), 2);
    const svgs = await page.evaluate(
      ([x, y]) => {
        const g = window.gridloom;
        const out: string[] = [];
        for (const h of [x, y, x]) {
          window.render?.(h ?? "");
          out.push(g?.svg() ?? "");
        }
        return out;
      },
      [a, b],
    );
    expect(svgs[0]).toBe(svgs[2]);
    expect(svgs[0]).not.toBe(svgs[1]);
    expect(sha(svgs[1] ?? "")).toBe(sha(toSVG(generate(p.doc, b ?? "").scene)));
  });
}

test("fixed size, done event and a random seed written to the URL", async ({ page }) => {
  const p = presets[0];
  if (!p) throw new Error("no preset");
  const file = join(dir, "size.html");
  writeFileSync(file, assembleMint(runtime, p.doc, meta));
  await page.addInitScript(() => {
    document.addEventListener("genart:done", () => {
      window.doneCount = (window.doneCount ?? 0) + 1;
    });
  });
  await openOffline(page, file, "?width=800");
  const info = await page.evaluate(() => ({
    w: window.rendered?.width,
    h: window.rendered?.height,
    done: window.doneCount,
    hash: new URL(location.href).searchParams.get("hash"),
  }));
  expect(info.w).toBe(800);
  expect(info.h).toBe(1000); // Breadboard is 4:5
  expect(info.done).toBe(1);
  expect(info.hash).toMatch(/^[0-9a-f]{64}$/);
});

test.describe("player contract", () => {
  const p = builtinPresets.find((x) => x.id === "breadboard");
  if (!p) throw new Error("no breadboard preset");
  const file = join(dir, "contract.html");
  writeFileSync(file, assembleMint(runtime, { ...p.doc, name: "Paleta ámbar, Núñez" }, meta));

  test("the content security policy blocks network access from the page", async ({ page }) => {
    await page.goto(`${pathToFileURL(file).href}?hash=${p.hash}`);
    await page.waitForFunction(() => window.rendered instanceof HTMLCanvasElement);
    const blocked = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/");
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
  });

  test("reads #hash=, keeps non-ASCII names intact, and fires done once per seed", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("genart:done", () => {
        window.doneCount = (window.doneCount ?? 0) + 1;
      });
    });
    await openOffline(page, file, `#hash=${p.hash}`);
    expect(await page.evaluate(() => window.gridloom?.hash)).toBe(p.hash);
    expect(await page.evaluate(() => window.gridloom?.doc.name)).toBe("Paleta ámbar, Núñez");
    expect(await page.title()).toBe("Mint test");
    const [a, b] = seedSeries(p.hash, 2);
    await page.evaluate(([x, y]) => [x, y, x].forEach((h) => window.render?.(h ?? "")), [a, b]);
    // A resize redraws but is not a new frame for capture tools.
    await page.setViewportSize({ width: 700, height: 500 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.doneCount)).toBe(4);
  });

  for (const bad of ["abc", "0x" + "g".repeat(64), "f".repeat(65)]) {
    test(`rejects the seed "${bad.slice(0, 12)}..." with an error signal`, async ({ page }) => {
      await page.goto(`${pathToFileURL(file).href}?hash=${bad}`);
      await page.waitForFunction(() => typeof window.gridloomError === "string");
      expect(await page.evaluate(() => window.rendered)).toBeUndefined();
    });
  }

  test("an empty seed counts as no seed", async ({ page }) => {
    await page.goto(`${pathToFileURL(file).href}?hash=`);
    await page.waitForFunction(() => window.rendered instanceof HTMLCanvasElement);
    expect(await page.evaluate(() => window.gridloom?.hash)).not.toBe("0".repeat(64));
  });

  test("width and height together fit the piece inside the box", async ({ page }) => {
    await page.goto(`${pathToFileURL(file).href}?hash=${p.hash}&width=800&height=800`);
    await page.waitForFunction(() => window.rendered instanceof HTMLCanvasElement);
    expect(await page.evaluate(() => [window.rendered?.width, window.rendered?.height])).toEqual([640, 800]);
  });
});
