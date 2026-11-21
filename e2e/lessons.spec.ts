import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gridloom.welcomed", "1");
    localStorage.setItem("gridloom.lessonLang", "en");
  });
  await page.goto("/");
  await expect(page.locator("main canvas")).toBeVisible();
});

test("a lesson adds its layer, walks through its steps, and switches language", async ({ page }) => {
  await page.getByRole("button", { name: "Learn" }).click();
  const picker = page.getByRole("dialog", { name: "Lessons" });
  await expect(picker).toContainText("Your first grid");
  await picker.getByRole("listitem").filter({ hasText: "Your first grid" }).getByRole("button", { name: "Start" }).click();

  // The lesson's layer is added, opened in the editor, and drawn: it is the studio's own code.
  await expect(page.getByRole("button", { name: /^My grid/ }).first()).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Script code" });
  await expect(editor).toContainText("cell.w / 4");
  await expect(page.getByRole("region", { name: "Code in this piece" })).toHaveCount(0);
  const panel = page.getByRole("region", { name: "Your first grid" });
  await expect(panel).toContainText("Step 1 of 4");
  await expect(panel).toContainText("One circle per cell");

  // Show me writes the step's finished code.
  await panel.getByRole("button", { name: "Show me" }).click();
  await expect(editor).toContainText("cell.w / 2");
  await expect(page.getByRole("status").filter({ hasText: "Drawing with this code." })).toBeVisible();

  await panel.getByRole("button", { name: "Next" }).click();
  await expect(panel).toContainText("Squares instead");

  // Spanish: the text changes, the code you have is left alone.
  await panel.getByRole("button", { name: "es", exact: true }).click();
  const panelEs = page.getByRole("region", { name: "Tu primera cuadrícula" });
  await expect(panelEs).toContainText("Paso 2 de 4");
  await expect(panelEs).toContainText("Ahora cuadrados");
  await panelEs.getByRole("button", { name: "Muéstrame" }).click();
  await expect(editor).toContainText("Mi cuadrícula");
  await expect(editor).toContainText('type: "rect"');

  for (let i = 0; i < 2; i++) await panelEs.getByRole("button", { name: "Siguiente" }).click();
  await panelEs.getByRole("button", { name: "Listo" }).click();
  await expect(panelEs).toContainText("Lección terminada");
  await panelEs.getByRole("button", { name: "Terminar lección" }).click();
  await expect(page.locator("summary", { hasText: "Helpers" })).toBeVisible();
});

test("the seeds lesson starts from its own code", async ({ page }) => {
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("dialog", { name: "Lessons" }).getByRole("listitem").filter({ hasText: "Seeds and randomness" }).getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: /^Seeds/ }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Seeds and randomness" })).toContainText("Random sizes");
  await expect(page.getByText("Size", { exact: true })).toBeVisible();
});
