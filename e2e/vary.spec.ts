import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Vary controls are drawn sliders, not native inputs, so mouse, pen and fingers all drag them.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("tramaloom.welcomed", "1"));
  await page.goto("/");
  await expect(page.locator("main canvas")).toBeVisible();
  // On narrow screens the layer list is a sheet behind a button.
  const layers = page.getByRole("button", { name: "Layers", exact: true });
  if (await layers.isVisible()) await layers.click();
  await page.getByRole("button", { name: /^Grid/ }).first().click();
});

const row = (page: Page, param: string) => page.locator(`[data-param="${param}"]`);

async function varyOn(page: Page, param: string): Promise<Locator> {
  const r = row(page, param);
  // Some settings already vary in the starter piece; a click would switch them off.
  const button = r.getByRole("button", { name: /^vary$/i });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  return r;
}

const now = async (slider: Locator) => Number(await slider.getAttribute("aria-valuenow"));

/** Drags with the mouse from one point to another, in steps, as a person would. */
async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

const centre = async (el: Locator) => {
  const b = await el.boundingBox();
  if (!b) throw new Error("not visible");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test("dragging a range thumb moves that end, and one undo puts it back", async ({ page }) => {
  const r = await varyOn(page, "cols");
  const max = r.getByRole("slider", { name: /highest value/ });
  const track = r.locator("[data-vary-track]");
  const before = await now(max);
  const box = await track.boundingBox();
  if (!box) throw new Error("no track");
  // To the track's last pixel: synthetic mouse events in Firefox are not captured past the element.
  await mouseDrag(page, await centre(max), { x: box.x + box.width - 1, y: box.y + box.height / 2 });
  await expect(max).toHaveAttribute("aria-valuenow", "64");
  await expect(max).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(max).toHaveAttribute("aria-valuenow", String(before));
});

test("a press on the track moves the nearest end there", async ({ page }) => {
  const r = await varyOn(page, "cols");
  const min = r.getByRole("slider", { name: /lowest value/ });
  const box = await r.locator("[data-vary-track]").boundingBox();
  if (!box) throw new Error("no track");
  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  await expect(min).toHaveAttribute("aria-valuenow", "1");
});

test("arrow keys on a thumb step its end and leave the seed alone", async ({ page }) => {
  const r = await varyOn(page, "cols");
  const min = r.getByRole("slider", { name: /lowest value/ });
  const url = page.url();
  const before = await now(min);
  await min.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(min).toHaveAttribute("aria-valuenow", String(before - 1));
  // Left is also "previous seed" in the studio; the slider keeps it.
  expect(page.url()).toBe(url);
});

test("dragging a choice's bar sets its chance, and the number boxes follow", async ({ page }) => {
  const r = await varyOn(page, "fit");
  const bar = r.locator('[data-share-slider="auto"]');
  const box = await bar.boundingBox();
  if (!box) throw new Error("no bar");
  await mouseDrag(page, { x: box.x + 2, y: box.y + box.height / 2 }, { x: box.x + box.width * 0.75, y: box.y + box.height / 2 });
  const pct = await now(bar);
  expect(pct).toBeGreaterThanOrEqual(72);
  expect(pct).toBeLessThanOrEqual(78);
  // Weights are whole numbers, so the box can read a point or two off the rounded share.
  const weight = Number(await r.getByRole("spinbutton", { name: /weight of auto/ }).inputValue());
  expect(Math.abs(weight - pct)).toBeLessThanOrEqual(2);
  // The tap did not land in the number box (on a tablet it would open the keyboard).
  await expect(r.getByRole("spinbutton", { name: /weight of auto/ })).not.toBeFocused();
});

test("a finger drags a range thumb", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "real touch input is driven through the Chrome DevTools protocol");
  const r = await varyOn(page, "cols");
  const max = r.getByRole("slider", { name: /highest value/ });
  const box = await r.locator("[data-vary-track]").boundingBox();
  if (!box) throw new Error("no track");
  const from = await centre(max);
  const toX = box.x + box.width + 20;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: from.y }] });
  await touch("touchStart", from.x);
  for (let i = 1; i <= 8; i++) await touch("touchMove", from.x + ((toX - from.x) * i) / 8);
  await touch("touchEnd", toX);
  await expect(max).toHaveAttribute("aria-valuenow", "64");
});
