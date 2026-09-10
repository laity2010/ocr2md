import { expect, test } from "@playwright/test";

test("insert br from source line keeps matching embed row visible after rescan", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator("#chapter-element-tab").click();
  await page.locator('#chapter-element-menu [data-review-module="嵌入块"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("嵌入块");

  await page.locator("#calibration-grid").evaluate((root) => {
    const scrollable = Array.from(root.querySelectorAll<HTMLElement>("*"))
      .find((element) => element.scrollHeight > element.clientHeight + 10);
    if (!scrollable) throw new Error("embed grid has no vertical scroll container");
    scrollable.scrollTop = scrollable.scrollHeight;
    scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  const visibleRows = page.locator("#calibration-grid .ag-row");
  await expect(visibleRows.last()).toBeVisible();
  await visibleRows.last().click();

  const activeLineNumber = page.locator(
    "#working-editor .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter",
  );
  await expect(activeLineNumber).toBeVisible();
  const sourceLine = (await activeLineNumber.textContent())?.trim() ?? "";
  expect(sourceLine).not.toBe("");

  const beforeUndo = Number(await page.locator("#undo-depth").textContent());
  await activeLineNumber.click();
  await page.locator("#source-line-insert-br").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#undo-depth")).toHaveText(String(beforeUndo + 1));
  await expect(page.locator("#working-editor .cm-content")).toBeFocused();
  await expect(activeLineNumber).toHaveText(sourceLine);

  const matchingPinnedCell = page.locator(
    '#calibration-grid .ag-grid-pinned-left-cells [col-id="sourceLine"]',
  ).filter({ hasText: new RegExp(`^${sourceLine}$`) }).first();
  await expect(matchingPinnedCell).toBeVisible();

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
});
