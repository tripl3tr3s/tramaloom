import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { checkCases, checkPayload } from "../packages/core/src/index.ts";

/**
 * Same document + hash must give a byte-identical display list and traits in
 * every engine. The reference is Node; each browser computes the same digests
 * on check.html. This proves the scope it states: the built-in presets at these
 * seeds, in these engine versions. Pixels may still differ by anti-aliasing.
 */
const expected = Object.fromEntries(
  checkCases().map((c) => [c.name, createHash("sha256").update(checkPayload(c)).digest("hex")]),
);

test("display list and traits match Node in this browser", async ({ page }) => {
  await page.goto("/check.html");
  const handle = await page.waitForFunction(() => window.__tramaloomCheck ?? (window.__tramaloomCheckError ? { error: window.__tramaloomCheckError } : undefined), undefined, {
    timeout: 30_000,
  });
  const actual = (await handle.jsonValue()) as Record<string, string>;
  expect(actual["error"], "check page error").toBeUndefined();
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [name, digest] of Object.entries(expected)) expect(actual[name], name).toBe(digest);
});

test("the studio renders the starter piece without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const canvas = page.locator("main canvas");
  await expect(canvas).toBeVisible();
  // The worker has drawn when the canvas has a real size.
  await expect.poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 15_000 }).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
