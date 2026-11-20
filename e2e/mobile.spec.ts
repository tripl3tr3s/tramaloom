import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gridloom.welcomed", "1"));
  await page.goto("/");
  await expect(page.locator("main canvas")).toBeVisible();
});

test("the toolbar fits a phone in two rows, with the rest under More", async ({ page }) => {
  const header = page.locator("header");
  // Two rows of controls, and nothing pushed past the right edge.
  const box = await header.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(90);
  const right = await header.evaluate((el) => Math.max(...[...el.querySelectorAll("button, input")].map((c) => c.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(390);
  await expect(page.getByRole("button", { name: "Mutate" })).toBeHidden();

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Library/ }).click();
  await expect(page.getByRole("dialog", { name: /Library/ })).toBeVisible();
});

test("a finger drags a layer to a new place in the stack", async ({ page, browserName }) => {
  // Real touch input needs CDP; the layout above is checked in every browser.
  test.skip(browserName !== "chromium", "touch drag is driven through the Chrome DevTools protocol");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  // Layer ids in stack order (display names number copies by position, so they cannot show a swap).
  const names = () => page.locator('ol[aria-label^="Layers"] button[title*="(id "]').evaluateAll((els) => els.map((el) => /\(id ([^)]+)\)/.exec(el.getAttribute("title") ?? "")?.[1]));
  const grips = page.getByTitle("Drag to reorder");
  // The starter has one movable layer; a copy gives it something to swap with.
  await page.getByRole("button", { name: /^Duplicate / }).first().click();
  expect(await grips.count()).toBeGreaterThanOrEqual(2);
  const before = await names();

  const from = await grips.nth(1).boundingBox();
  const to = await grips.nth(0).boundingBox();
  if (!from || !to) throw new Error("no grip boxes");
  const cdp = await page.context().newCDPSession(page);
  const point = (b: { x: number; y: number; width: number; height: number }, dy = 0) => [{ x: b.x + b.width / 2, y: b.y + b.height / 2 + dy }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from) });
  for (const f of [0.25, 0.5, 0.75, 1]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point({ ...to, y: from.y + (to.y - from.y) * f }, -to.height / 4) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  const after = await names();
  expect(after).not.toEqual(before);
  expect(after.toSorted()).toEqual(before.toSorted());
});
