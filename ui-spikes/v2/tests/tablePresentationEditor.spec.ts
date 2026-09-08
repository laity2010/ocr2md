import { expect, test, type Page } from "@playwright/test";

async function headerOrder(page: Page): Promise<string[]> {
  return page.locator("#calibration-grid .ag-header-cell").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        colId: node.getAttribute("col-id") ?? "",
        left: node.getBoundingClientRect().left,
      }))
      .filter((item) => item.colId)
      .sort((left, right) => left.left - right.left)
      .map((item) => item.colId),
  );
}

async function replaceTableConfig(page: Page, source: string): Promise<void> {
  const content = page.locator("#table-config-editor .cm-content");
  await content.click();
  await content.fill(source);
}

test("table presentation config hot-applies, guards invalid edits, persists and resets without dirtying chapter", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".source-tab")).toHaveText([
    "源码",
    "自定义 CSS",
    "表格配置",
    "正则搜索",
  ]);

  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await page.locator('[data-review-module="注释"]').click();
  await expect(page.locator("#active-review-module")).toHaveText("注释");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#can-save")).toHaveText("否");

  await page.locator("#editor-tab-table-config").click();
  await expect(page.locator("#editor-tab-table-config")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#table-config-wrap")).toBeVisible();
  await expect(page.locator("#editor-mode-status")).toContainText("表格配置");

  const valid = JSON.stringify({
    version: 1,
    sourceEditor: {
      showHardReturns: false,
    },
    modules: {
      注释: {
        columns: ["注释号", "行号", "预览", "行类型", "配对状态"],
        sort: [
          { column: "注释号", direction: "desc" },
          "行号",
        ],
        columnStyles: {
          行号: { pinned: null },
          预览: { minWidth: 220, flex: 1 },
          配对状态: { hidden: true },
        },
      },
    },
  }, null, 2) + "\n";

  await replaceTableConfig(page, valid);
  await expect(page.locator("#editor-mode-status")).toContainText(
    "实时预览（未保存）",
  );
  await expect.poll(async () => (await headerOrder(page)).slice(0, 3))
    .toEqual(["annotationNumber", "sourceLine", "preview"]);
  await expect(page.locator("#calibration-grid .ag-row").first().locator(
    "input.annotation-number-input",
  )).toHaveValue("10");
  await expect(page.locator(
    '#calibration-grid .ag-header-cell[col-id="annotationPairStatus"]',
  )).toHaveCount(0);
  expect(await page.locator(
    '#calibration-grid .ag-header-cell[col-id="preview"]',
  ).evaluate((node) => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(220);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#can-save")).toHaveText("否");

  await page.locator("#editor-tab-source").click();
  await expect(page.locator("#working-editor .cm-hard-return-marker")).toHaveCount(0);
  await page.locator("#editor-tab-table-config").click();

  await replaceTableConfig(page, "{ bad json");
  await expect(page.locator("#editor-mode-status")).toContainText(
    "表格配置错误 · 已保留最后有效配置",
  );
  await expect(page.locator("#editor-mode-status")).toContainText("第 1 行");
  await page.locator("#editor-tab-source").click();
  await expect(page.locator("#working-editor .cm-hard-return-marker")).toHaveCount(0);
  await page.locator("#editor-tab-table-config").click();
  await expect.poll(async () => (await headerOrder(page)).slice(0, 3))
    .toEqual(["annotationNumber", "sourceLine", "preview"]);
  await expect(page.locator("#calibration-grid .ag-row").first().locator(
    "input.annotation-number-input",
  )).toHaveValue("10");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");

  await replaceTableConfig(page, valid);
  await expect(page.locator("#editor-mode-status")).toContainText(
    "实时预览（未保存）",
  );
  await page.locator("#table-config-save").click();
  await expect(page.locator("#editor-mode-status")).toHaveText(
    "表格配置已保存 · 项目级",
  );

  const stored = await request.get("/__workspace/table-presentation");
  expect(stored.ok()).toBeTruthy();
  const storedBody = await stored.json();
  expect(storedBody.exists).toBe(true);
  expect(storedBody.source).toBe(valid);

  await page.reload();
  await page.locator("#chapter-select").selectOption({
    label: "chapters/01 Buffett’s Alpha",
  });
  await page.locator('[data-review-module="注释"]').click();
  await expect.poll(async () => (await headerOrder(page)).slice(0, 3))
    .toEqual(["annotationNumber", "sourceLine", "preview"]);
  await expect(page.locator("#calibration-grid .ag-row").first().locator(
    "input.annotation-number-input",
  )).toHaveValue("10");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#can-save")).toHaveText("否");

  await page.locator("#editor-tab-table-config").click();
  await page.locator("#table-config-reset").click();
  await expect(page.locator("#editor-mode-status")).toHaveText(
    "表格配置已恢复默认并保存",
  );
  await expect.poll(async () => (await headerOrder(page)).slice(0, 4))
    .toEqual(["sourceLine", "lineType", "annotationNumber", "preview"]);
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#can-save")).toHaveText("否");
  await page.locator("#editor-tab-source").click();
  await expect(page.locator("#working-editor .cm-hard-return-marker").first())
    .toBeVisible();
});
