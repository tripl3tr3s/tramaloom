import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gridloom.welcomed", "1"));
  await page.goto("/");
  await expect(page.locator("main canvas")).toBeVisible();
});

async function addScriptLayer(page: Page) {
  await page.getByRole("button", { name: "Add layer" }).click();
  await page.getByRole("menuitem", { name: /^Script/ }).click();
  await page.getByRole("button", { name: "Edit code" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Drawing with this code." })).toBeVisible();
}

/** Replaces the editor's whole text. */
async function setCode(page: Page, code: string) {
  const editor = page.getByRole("textbox", { name: "Script code" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.insertText(code);
}

const status = (page: Page) => page.getByRole("status").filter({ hasText: /./ }).last();

test("a Script layer draws its starter code, with its settings in the panel", async ({ page }) => {
  await addScriptLayer(page);
  await expect(page.getByRole("button", { name: /^Rings/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rings", exact: true })).toBeVisible();
  await expect(page.getByText("Wobble", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(/^Script/)).toHaveCount(0);
  await page.screenshot({ path: "/tmp/claude-1000/-home-tripl3-Projects-Creative/f64bdb85-bc07-4034-be21-4168c4cae371/scratchpad/script-editor.png" });
});

test("editing the code redraws, and a mistake keeps the last working version", async ({ page }) => {
  await addScriptLayer(page);
  await setCode(page, 'layer({\n  label: "Dots",\n  params: { n: { kind: "int", label: "Count", min: 1, max: 9, default: 3 } },\n  apply(scene, v) {\n    return addItems(scene, [{ type: "circle", cx: 0.5, cy: 0.5, r: 0.1 * v.n, fill: "#000000" }]);\n  },\n});\n');
  await expect(page.getByRole("button", { name: /^Dots/ }).first()).toBeVisible();
  await expect(page.getByText("Count", { exact: true })).toBeVisible();

  // A mistake inside apply: the error names its line.
  await setCode(page, 'layer({\n  label: "Dots",\n  apply(scene) {\n    notDefined();\n    return scene;\n  },\n});\n');
  await expect(status(page)).toContainText("notDefined");
  await expect(page.getByRole("button", { name: "Line 4" })).toBeVisible();

  // A syntax error: found by the editor's parser, nothing replaced.
  await setCode(page, 'layer({\n  label: "Broken",\n  apply(scene) {\n    return scene\n  ,\n});\n');
  await expect(status(page)).toContainText("last working version");
  await expect(page.getByRole("button", { name: /^Broken/ })).toHaveCount(0);
});

test("a script that never ends is stopped", async ({ page }) => {
  await addScriptLayer(page);
  await setCode(page, "while (true) {}\n");
  await expect(status(page)).toContainText("was stopped", { timeout: 10_000 });
  // The sandbox recovers for the next version.
  await setCode(page, 'layer({ label: "Back", apply(scene) { return scene; } });\n');
  await expect(page.getByRole("button", { name: /^Back/ }).first()).toBeVisible();
});

test("a script that floods messages is cut off, and the studio stays usable", async ({ page }) => {
  await addScriptLayer(page);
  const t0 = Date.now();
  await setCode(page, 'for (;;) postMessage("x".repeat(1000));\n');
  await expect(status(page)).toContainText(/unexpected messages|unreadable/, { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  await setCode(page, 'layer({ label: "Calm", apply(scene) { return scene; } });\n');
  await expect(page.getByRole("button", { name: /^Calm/ }).first()).toBeVisible();
});

test("a script stopped for running too long fails at once when it comes back", async ({ page }) => {
  await addScriptLayer(page);
  await setCode(page, "while (true) {}\n");
  await expect(status(page)).toContainText("was stopped", { timeout: 10_000 });
  await setCode(page, 'layer({ label: "Other", apply(scene) { return scene; } });\n');
  await expect(page.getByRole("button", { name: /^Other/ }).first()).toBeVisible();
  const t0 = Date.now();
  await setCode(page, "while (true) {}\n");
  await expect(status(page)).toContainText("stopped earlier");
  expect(Date.now() - t0).toBeLessThan(2500);
});

test("the sandbox page refuses to run when embedded without the sandbox attribute", async ({ page }) => {
  // Another site could embed sandbox.html directly; it would then have the studio's origin.
  const messages = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve) => {
        const seen: unknown[] = [];
        const frame = document.createElement("iframe");
        addEventListener("message", (e) => {
          if (e.source === frame.contentWindow) seen.push(e.data);
        });
        frame.onload = () => {
          frame.contentWindow?.postMessage({ kind: "init", source: "postMessage('ran')" }, "*");
          setTimeout(() => resolve(seen), 800);
        };
        frame.src = "sandbox.html";
        document.body.append(frame);
      }),
  );
  expect(messages).toEqual([]);
});

test("a script cannot reach the network", async ({ page }) => {
  const leaks: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("leak")) leaks.push(r.url());
  });
  await addScriptLayer(page);
  await setCode(
    page,
    `const tries = [];
try { fetch("/leak-fetch").catch(() => {}); } catch (e) {}
try { const x = new XMLHttpRequest(); x.open("GET", "/leak-xhr"); x.send(); } catch (e) {}
try { importScripts("/leak-import.js"); } catch (e) {}
try { new WebSocket("ws://localhost:1/leak"); } catch (e) {}
try { indexedDB.open("gridloom"); tries.push("idb"); } catch (e) {}
layer({ label: "Quiet", apply(scene) { return scene; } });
`,
  );
  await expect(page.getByRole("button", { name: /^Quiet/ }).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(leaks).toEqual([]);
});

test("Remix turns a layer into a script that draws the same picture", async ({ page }) => {
  const pixels = () => page.locator("main canvas").evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole("button", { name: /^Cell fill/ }).click();
  await page.waitForTimeout(400);
  const before = await pixels();
  await page.getByRole("button", { name: "Code", exact: true }).click();
  await page.getByRole("button", { name: "Remix" }).click();
  await expect(page.getByRole("button", { name: /^Cell fill remix/ }).first()).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Script code" })).toContainText("A remix of the built-in Cell fill layer");
  await expect(page.getByRole("status").filter({ hasText: "Drawing with this code." })).toBeVisible();
  // The open editor makes the canvas smaller; compare at the original size.
  await page.getByRole("button", { name: "Close" }).click();
  await expect.poll(async () => (await pixels()) === before, { timeout: 10_000 }).toBe(true);
  // Undo brings the built-in layer back.
  await page.locator("main canvas").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: /^Cell fill remix/ })).toHaveCount(0);
});
