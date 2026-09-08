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

test("review module tabs filter real calibration rows without dirtying chapter", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#state-value")).toHaveText("idle");

  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator('[data-review-module="章节标题"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#review-grid-status")).toContainText("章节标题 · 10 行");

  await page.locator('[data-review-module="注释"]').click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("注释");
  await expect(page.locator("#active-module-rows")).toHaveText("20");
  expect(await visualHeaderOrder(page)).toEqual(["行号", "行类型", "注释号", "预览"]);
  const annotationRows = await page.locator("#calibration-grid .ag-row").evaluateAll((rows) =>
    rows.slice(0, 6).map((row) => ({
      line: Number(row.querySelector('[col-id="sourceLine"]')?.textContent?.trim()),
      group: Number(row.querySelector('[col-id="annotationNumber"]')?.textContent?.trim()),
    })),
  );
  expect(annotationRows.map((row) => row.group)).toEqual([1, 1, 2, 2, 3, 3]);
  expect(annotationRows[0].line).toBeLessThan(annotationRows[1].line);

  await page.locator('[data-review-module="嵌入块"]').click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("嵌入块");
  await expect(page.locator("#active-module-rows")).toHaveText("51");
  await expect(page.locator("#embed-group-status")).toHaveText(
    "总计 65 · 可见 51 · 组 11 · 未分组 0",
  );
  expect(await visualHeaderOrder(page)).toEqual(["行号", "行类型", "组号", "预览"]);
  const embedRows = await page.locator("#calibration-grid .ag-row").evaluateAll((rows) =>
    rows.slice(0, 7).map((row) => ({
      line: Number(row.querySelector('[col-id="sourceLine"]')?.textContent?.trim()),
      group: Number(row.querySelector('[col-id="embedNumber"]')?.textContent?.trim()),
    })),
  );
  expect(embedRows.map((row) => row.group)).toEqual([1, 1, 1, 2, 2, 2, 2]);
  expect(embedRows.slice(0, 3).map((row) => row.line))
    .toEqual([...embedRows.slice(0, 3).map((row) => row.line)].sort((a, b) => a - b));

  await page.locator('[data-review-module="非法断行"]').click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#active-review-module")).toHaveText("非法断行");
  await expect(page.locator("#active-module-rows")).toHaveText("6");
  expect(await visualHeaderOrder(page)).toEqual([
    "断行处",
    "行类型",
    "预览（前10 + 后10）",
    "合并预览",
  ]);
  await expect(page.locator('#calibration-grid [role="grid"]')).toHaveAttribute(
    "aria-colcount",
    "5",
  );
  const firstContextPreview = page.locator(
    "#calibration-grid .illegal-line-break-preview",
  ).first();
  await expect(firstContextPreview).toContainText("⏎");
  const horizontalScroll = page.locator(
    "#calibration-grid .ag-body-horizontal-scroll-viewport",
  );
  await horizontalScroll.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    page.locator("#calibration-grid .ag-header-cell-text").filter({ hasText: "判断" }),
  ).toBeVisible();
  const firstReason = page.locator(
    '#calibration-grid [col-id="breakReason"]',
  ).first();
  await expect(firstReason).not.toHaveText("");
  await expect(page.locator("#can-save")).toHaveText("否");
});

test("clicking a review row relocates current working and focuses CodeMirror", async ({ page }) => {
  await page.goto("/");
  await page.locator("#chapter-select").selectOption({ label: "chapters/01 Buffett’s Alpha" });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");

  await page.locator('[data-review-module="非法断行"]').click();
  await expect(page.locator("#active-module-rows")).toHaveText("6");

  const firstRow = page.locator("#calibration-grid .ag-row").first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  await expect(page.locator("#focused-source-line")).not.toHaveText("—");
  const focusedLine = Number(await page.locator("#focused-source-line").textContent());
  expect(focusedLine).toBeGreaterThan(1);
  await expect(page.locator("#source-location-status")).toHaveText(
    `已定位断行 · 第 ${focusedLine} 行 · 前后各 10 字`,
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#can-save")).toHaveText("否");
});
