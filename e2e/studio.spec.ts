import { expect, test } from "@playwright/test";

// The studio's own UI flows that depend on real browser storage and focus.

test("the welcome card shows once, then stays dismissed", async ({ page }) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to Tramaloom" });
  await expect(welcome).toBeVisible();
  await page.getByRole("button", { name: "Start making" }).click();
  await expect(welcome).toBeHidden();
  await page.reload();
  await expect(page.locator("main canvas")).toBeVisible();
  await expect(welcome).toBeHidden();
});

test.describe("after the welcome", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("tramaloom.welcomed", "1"));
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

  test("Code shows the source that draws the selected layer, and Escape returns to it", async ({ page }) => {
    await page.getByRole("button", { name: /^Cell fill/ }).click();
    const code = page.getByRole("button", { name: "Code", exact: true });
    await code.click();
    const dialog = page.getByRole("dialog", { name: "How Cell fill draws" });
    await expect(dialog).toBeVisible();
    const source = dialog.getByRole("textbox", { name: "Source code of Cell fill" });
    // The editor renders only the lines in view, so check near the top of the file.
    await expect(source).toContainText('id: "cellFill"');
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(code).toBeFocused();
  });

  test("the Code window fits above the favourites strip on a short screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.keyboard.press("b");
    await expect(page.getByText(/Favourites/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Palette/ }).first().click();
    await page.getByRole("button", { name: "Code", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "How Palette draws" });
    await expect(dialog.getByRole("textbox", { name: "Source code of Palette" })).toContainText('id: "palette"');
    const box = await dialog.boundingBox();
    const main = await page.locator("main").boundingBox();
    if (!box || !main) throw new Error("no boxes");
    expect(box.y).toBeGreaterThanOrEqual(main.y);
    expect(box.y + box.height).toBeLessThanOrEqual(main.y + main.height);
  });

  test("the mint preview shows the piece in an isolated frame", async ({ page, context }) => {
    await page.keyboard.press("e");
    await page.getByRole("tab", { name: /Mint/ }).click();
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Preview with this seed" }).click();
    const preview = await popup;
    await expect(preview.locator("iframe")).toBeAttached();
    await expect.poll(() => preview.frames().length).toBeGreaterThan(1);
    const frame = preview.frames()[1];
    if (!frame) throw new Error("no frame");
    await frame.waitForFunction(() => (window as unknown as { rendered?: unknown }).rendered instanceof HTMLCanvasElement, undefined, { timeout: 10_000 });
    // Opaque origin: the piece's code cannot reach the studio's saved pieces.
    expect(await frame.evaluate(() => self.origin)).toBe("null");
    expect(await frame.evaluate(() => { try { localStorage.length; return "storage"; } catch { return "blocked"; } })).toBe("blocked");
  });

  test("T shows the piece repeated 3x3, with a hint while the margin would leave seams", async ({ page }) => {
    await page.keyboard.press("t");
    await expect(page.getByRole("img", { name: "The piece repeated three by three" })).toBeVisible();
    await expect(page.getByText("for a seamless repeat")).toBeVisible();
    await page.keyboard.press("t");
    await expect(page.getByRole("img", { name: "The piece repeated three by three" })).toBeHidden();
  });

  test("breeding with a preset offers children and adopting one changes the piece", async ({ page }) => {
    await page.keyboard.press("m");
    await page.getByRole("button", { name: "breed", exact: true }).click();
    await page.getByRole("combobox", { name: "Partner" }).selectOption({ label: "Labyrinth" });
    // Wait for the children themselves: until they render, the old batch shows and picks are ignored.
    const ready = page.getByRole("dialog", { name: "Mutation grid" }).locator('button[aria-disabled="false"]');
    await expect(ready).toHaveCount(9, { timeout: 15_000 });
    const before = await page.evaluate(() => location.hash);
    await page.keyboard.press("6");
    await expect(page.getByRole("dialog", { name: "Mutation grid" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(before);
  });

  test("a long params panel says what is below and scrolls to it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    const more = page.locator("#sheet-params").getByRole("button", { name: /^More/ });
    await expect(more).toHaveText(/More: Zones/);
    await more.click();
    await expect(page.locator('#sheet-params [data-section="Zones"]')).toBeInViewport();
  });
});
