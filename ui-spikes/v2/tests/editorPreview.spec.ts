import { expect, test } from "@playwright/test";

test("editor preview mirrors working and horizontal splitter persists", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  const preview = page.locator("#markdown-preview");
  await expect(preview).toContainText("打开章节后显示 Markdown 预览");

  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await expect(preview.locator("h1,h2,h3,h4,h5,h6").first()).toBeVisible();
  const previewText = (await preview.textContent()) ?? "";
  expect(previewText.length).toBeGreaterThan(100);

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("Z");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect.poll(async () => (await preview.textContent()) ?? "").not.toBe(previewText);

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect.poll(async () => (await preview.textContent()) ?? "").toBe(previewText);

  const splitter = page.locator("#editor-preview-splitter");
  await expect(splitter).toHaveAttribute("aria-valuenow", "55");
  await splitter.focus();
  await page.keyboard.press("ArrowDown");
  await expect(splitter).toHaveAttribute("aria-valuenow", "57");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const stored = await page.evaluate(() =>
    localStorage.getItem("ocr2md-v2-editor-preview-split-v1"),
  );
  expect(stored).toBe("57");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("#editor-preview-splitter")).toHaveAttribute(
    "aria-valuenow",
    "57",
  );
  await expect(page.locator("#state-value")).toHaveText("idle");
});
