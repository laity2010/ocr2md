import { expect, test, type Page } from "@playwright/test";

async function visualHeaderOrder(page: Page): Promise<string[]> {
  return page.locator("#calibration-grid .ag-header-cell-text").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        text: node.textContent?.trim() ?? "",
        left: node.getBoundingClientRect().left,
      }))
      .sort((left, right) => left.left - right.left)
      .map((item) => item.text),
  );
}

test("changed-line module is visible for chapters and renders a read-only five-column audit table", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const tab = page.locator('[data-review-module="变动行"]');
  await expect(tab).toBeVisible();
  await expect(tab).toBeEnabled();

  await tab.click();
  await expect(page.locator("#active-review-module")).toHaveText("变动行");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  const count = Number(await page.locator("#active-module-rows").textContent());
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("#review-grid-status")).toHaveText("变动行 · " + count + " 行");

  expect(await visualHeaderOrder(page)).toEqual([
    "行号",
    "变动",
    "归属模块",
    "变动内容",
  ]);
  await expect(page.locator('#calibration-grid [role="grid"]')).toHaveAttribute(
    "aria-colcount",
    "5",
  );
  await expect(page.locator("#calibration-grid .calibration-line-type")).toHaveCount(0);
  await expect(page.locator("#calibration-grid .changed-line-state").first()).toBeVisible();

  const horizontalScroll = page.locator(
    "#calibration-grid .ag-body-horizontal-scroll-viewport",
  );
  await horizontalScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.locator("#calibration-grid .ag-header-cell-text").filter({ hasText: "原稿内容" }),
  ).toBeVisible();

  await expect(page.locator("#can-save")).toHaveText("否");
});

test("changed-line module is hidden in boundary workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#chapter-select").selectOption("__node_ocr__");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("章节定界");
  await expect(page.locator('[data-review-module="变动行"]')).toBeHidden();
});
