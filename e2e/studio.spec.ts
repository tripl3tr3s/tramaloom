import { expect, test } from "@playwright/test";

// The studio's own UI flows that depend on real browser storage and focus.

test("the welcome card shows once, then stays dismissed", async ({ page }) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to Gridloom" });
  await expect(welcome).toBeVisible();
  await page.getByRole("button", { name: "Start making" }).click();
  await expect(welcome).toBeHidden();
  await page.reload();
  await expect(page.locator("main canvas")).toBeVisible();
  await expect(welcome).toBeHidden();
});

test.describe("after the welcome", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("gridloom.welcomed", "1"));
    await page.goto("/");
    await expect(page.locator("main canvas")).toBeVisible();
  });

  test("? opens the shortcut list and closing returns focus to its button", async ({ page }) => {
    const button = page.getByRole("button", { name: "Keyboard shortcuts" });
    await button.click();
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(button).toBeFocused();
  });

  test("starring a seed adds it to the favourites strip and survives a reload", async ({ page }) => {
    const star = page.getByRole("button", { name: "Favourite this seed" });
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    const strip = page.getByRole("region", { name: "Favourite seeds" });
    await expect(strip.getByRole("button", { name: /^Go to seed/ })).toHaveCount(1);
    await page.reload();
    await expect(strip.getByRole("button", { name: /^Go to seed/ })).toHaveCount(1);
  });

  test("resetting a param removes its reset button and is undoable", async ({ page }) => {
    const reset = page.getByRole("button", { name: "Reset Palette to default" });
    await reset.click();
    await expect(reset).toBeHidden();
    await expect(page.getByText("Unsaved changes")).toBeAttached();
    await page.keyboard.press("Control+z");
    await expect(reset).toBeVisible();
  });
});
