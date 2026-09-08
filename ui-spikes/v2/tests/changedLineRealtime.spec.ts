import { expect, test } from "@playwright/test";

test("changed-line audit refreshes live and +N tracks newly unread diffs", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const changedTab = page.locator('[data-review-module="变动行"]');
  const titleTab = page.locator('[data-review-module="章节标题"]');

  await changedTab.click();
  const baselineCount = Number(await page.locator("#active-module-rows").textContent());
  expect(baselineCount).toBeGreaterThan(0);
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await titleTab.click();
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");

  const lastLine = page.locator("#working-editor .cm-line").last();
  await lastLine.scrollIntoViewIfNeeded();
  await lastLine.click();
  await page.keyboard.press("End");
  await page.keyboard.type("Z");

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(changedTab).toHaveAttribute("data-change-notice", "+1");
  await expect(changedTab).toHaveClass(/has-change-notice/);

  await changedTab.click();
  await expect(page.locator("#active-review-module")).toHaveText("变动行");
  await expect(page.locator("#active-module-rows")).toHaveText(String(baselineCount + 1));
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await titleTab.click();
  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await page.locator("#redo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(changedTab).toHaveAttribute("data-change-notice", "+1");

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(changedTab).not.toHaveAttribute("data-change-notice", /.+/);

  await changedTab.click();
  await expect(page.locator("#active-module-rows")).toHaveText(String(baselineCount));
  await expect(page.locator("#can-save")).toHaveText("否");
});
