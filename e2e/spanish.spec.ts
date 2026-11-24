import { expect, test } from "@playwright/test";

// In Spanish, the modules, their settings and the presets read in Spanish too,
// while the document underneath keeps the English ids (share links stay portable).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tramaloom.welcomed", "1");
    localStorage.setItem("tramaloom.lang", "es");
  });
  await page.goto("/");
  await expect(page.locator("main canvas")).toBeVisible();
});

test("the layer list, the settings panel and its dropdowns are in Spanish", async ({ page }) => {
  const layers = page.getByRole("list", { name: /^Capas/ });
  await expect(layers.getByRole("button", { name: "Cuadrícula", exact: true })).toBeVisible();
  await expect(layers.getByRole("button", { name: "Relleno de celdas", exact: true })).toBeVisible();

  await layers.getByRole("button", { name: "Cuadrícula", exact: true }).click();
  const panel = page.locator("aside, [role=complementary]").filter({ has: page.getByRole("heading", { name: "Cuadrícula" }) });
  await expect(panel.getByRole("heading", { name: "Cuadrícula" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Disposición" })).toBeVisible();
  await expect(panel.getByText("Columnas", { exact: true })).toBeVisible();
  await expect(panel.getByText("Columns", { exact: true })).toHaveCount(0);

  // The shown name is Spanish, the stored value stays the English id.
  const mask = panel.getByRole("combobox", { name: "Máscara" });
  await expect(mask.locator("option", { hasText: "círculo" })).toHaveAttribute("value", "circle");
  await mask.selectOption({ label: "círculo" });
  await expect(mask).toHaveValue("circle");
});

test("the Library shows the presets under Spanish names", async ({ page }) => {
  await page.keyboard.press("l");
  const library = page.getByRole("dialog", { name: /Biblioteca/ });
  await expect(library).toBeVisible();
  await expect(library.getByText("Entrelazado", { exact: true })).toBeVisible();
  await expect(library.getByText("Knotwork", { exact: true })).toHaveCount(0);
});
