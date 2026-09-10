import { expect, test } from "@playwright/test";

test("typing > in source reveals the newly scanned embed-block row", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="嵌入块"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("嵌入块");

  const source14 = page.locator(
    '#calibration-grid .ag-grid-pinned-left-cells [col-id="sourceLine"]',
  ).filter({ hasText: /^14$/ }).first();
  await expect(source14).toBeVisible();
  await source14.click();
  await expect(page.locator("#working-editor .cm-content")).toBeFocused();

  const activeLineNumber = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
  );
  await expect(activeLineNumber).toHaveText("14");
  const gutter15 = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement",
  ).filter({ hasText: /^15$/ }).first();
  await expect(gutter15).toBeVisible();
  const gutter15Box = await gutter15.boundingBox();
  const contentBox = await page.locator("#working-editor .cm-content").boundingBox();
  if (!gutter15Box || !contentBox) throw new Error("cannot locate source line 15");
  await page.mouse.click(
    contentBox.x + 12,
    gutter15Box.y + gutter15Box.height / 2,
  );
  await expect(activeLineNumber).toHaveText("15");

  const newRowCell = page.locator(
    '#calibration-grid .ag-grid-pinned-left-cells [col-id="sourceLine"]',
  ).filter({ hasText: /^15$/ }).first();
  await expect(newRowCell).toHaveCount(0);

  await page.locator("#calibration-grid").evaluate((root) => {
    const scrollable = Array.from(root.querySelectorAll<HTMLElement>("*"))
      .find((element) => element.scrollHeight > element.clientHeight + 10);
    if (!scrollable) throw new Error("embed grid has no vertical scroll container");
    scrollable.scrollTop = scrollable.scrollHeight;
    scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await page.locator("#working-editor .cm-content").focus();
  await page.keyboard.type(">");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-editor .cm-content")).toBeFocused();
  await expect(activeLineNumber).toHaveText("15");
  await expect(newRowCell).toBeVisible();
  const newRow = newRowCell.locator("xpath=ancestor::*[@role='row'][1]");
  await expect(newRow).toContainText("嵌入块首");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
});
