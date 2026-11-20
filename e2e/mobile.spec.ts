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
