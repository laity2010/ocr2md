import { expect, test } from "@playwright/test";

test("changed-line modified/added rows locate exact working line while deleted rows stay non-navigable", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator('[data-review-module="变动行"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("变动行");
  await expect(page.locator("#active-module-rows")).not.toHaveText("0");

  const navigableRow = page.locator(
    "#calibration-grid .ag-row:not(.row-deleted-change)",
  ).first();
  await expect(navigableRow).toBeVisible();
  const displayedLine = Number(
    await navigableRow.locator('[col-id="sourceLine"]').textContent(),
  );
  expect(displayedLine).toBeGreaterThan(0);

  await navigableRow.click();
  await expect(page.locator("#focused-source-line")).toHaveText(String(displayedLine));
  await expect(page.locator("#source-location-status")).toHaveText(
    "源码定位：第 " + displayedLine + " 行",
  );

  const focusedBeforeDeleted = await page.locator("#focused-source-line").textContent();
  const deletedRow = page.locator(
    "#calibration-grid .ag-row.row-deleted-change",
  ).first();
  await expect(deletedRow).toBeVisible();

  const deletedCell = deletedRow.locator(".ag-cell").first();
  await expect(deletedCell).toHaveCSS("text-decoration-line", "line-through");

  await deletedRow.click();
  await expect(page.locator("#source-location-status")).toHaveText(
    "该行已删除，无法定位到工作稿",
  );
  await expect(page.locator("#focused-source-line")).toHaveText(
    focusedBeforeDeleted ?? "—",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#can-save")).toHaveText("否");
});
