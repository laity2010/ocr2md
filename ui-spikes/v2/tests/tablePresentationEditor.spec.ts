import { expect, test, type Page } from "@playwright/test";
import { TABLE_PRESENTATION_DEFAULT_SOURCE } from "../src/tablePresentationConfig";

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
  await content.press("ControlOrMeta+A");
  await content.fill(source);
}

test("table presentation config hot-applies, guards invalid edits, persists and resets without dirtying chapter", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.locator(".source-tab")).toHaveText([
    "源码",
    "自定义 CSS",
    "表格配置",
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

  await expect(page.locator("#table-config-grid")).toBeVisible();
  await expect(page.locator("#calibration-grid")).toBeHidden();
  await expect(page.locator("#config-module-tab")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.locator('#table-config-grid [role="grid"]'),
  ).toHaveAttribute("aria-colcount", "5");
  await expect(page.locator("#table-config-grid .ag-header-row-column .ag-header-cell")).toHaveText([
    "控件",
    "功能组",
    "键名",
    "值",
  ]);
  await page.locator(
    "#table-config-grid .ag-body-horizontal-scroll-viewport",
  ).evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(
    page.locator(
      '#table-config-grid .ag-header-row-column .ag-header-cell[col-id="description"]',
    ),
  ).toContainText("中文描述");
  await page.locator(
    "#table-config-grid .ag-body-horizontal-scroll-viewport",
  ).evaluate((element) => {
    element.scrollLeft = 0;
  });

  const enumFilterButton = (colId: string) =>
    page.locator(
      "#table-config-grid .ag-header-row-column "
        + ".ag-header-cell[col-id=\"" + colId + "\"] "
        + ".ag-header-cell-filter-button",
    );

  await expect(enumFilterButton("control")).toBeVisible();
  await expect(enumFilterButton("functionGroup")).toBeVisible();
  await expect(enumFilterButton("key")).toBeVisible();
  await expect(enumFilterButton("value")).toHaveCount(0);

  const filteredRows = page.locator("#table-config-grid .ag-row");

  await enumFilterButton("control").click();
  const controlFilterPopup = page.locator(".config-enum-filter");
  await expect(controlFilterPopup).toBeVisible();
  const controlAll = controlFilterPopup.getByRole("checkbox", { name: "All" });
  await expect(controlAll).toBeChecked();
  await expect(
    controlFilterPopup.getByRole("checkbox", { name: "注释数据表" }),
  ).toBeChecked();
  await expect(
    controlFilterPopup.getByRole("checkbox", { name: "嵌入块数据表" }),
  ).toBeChecked();

  await controlAll.uncheck();
  await expect(filteredRows).toHaveCount(0);
  await controlFilterPopup
    .getByRole("checkbox", { name: "注释数据表" })
    .check();
  await expect(filteredRows).toHaveCount(3);
  await controlFilterPopup
    .getByRole("checkbox", { name: "嵌入块数据表" })
    .check();
  await expect(filteredRows).toHaveCount(6);
  await controlFilterPopup
    .getByRole("checkbox", { name: "嵌入块数据表" })
    .uncheck();
  await expect(filteredRows).toHaveCount(3);
  await page.keyboard.press("Escape");

  await enumFilterButton("key").click();
  const keyFilterPopup = page.locator(".config-enum-filter");
  await expect(keyFilterPopup).toBeVisible();
  const keyAll = keyFilterPopup.getByRole("checkbox", { name: "All" });
  await keyAll.uncheck();
  await expect(filteredRows).toHaveCount(0);
  await keyFilterPopup.getByRole("checkbox", { name: "sort" }).check();
  await expect(filteredRows).toHaveCount(1);
  await expect(filteredRows).toContainText("sort");
  await page.keyboard.press("Escape");

  await enumFilterButton("functionGroup").click();
  const groupFilterPopup = page.locator(".config-enum-filter");
  await expect(groupFilterPopup).toBeVisible();
  const groupAll = groupFilterPopup.getByRole("checkbox", { name: "All" });
  await expect(groupAll).toBeChecked();
  await groupAll.uncheck();
  await expect(filteredRows).toHaveCount(0);
  await groupFilterPopup.getByRole("checkbox", { name: "通用" }).check();
  await expect(filteredRows).toHaveCount(1);
  await expect(groupAll).toBeChecked();
  await page.keyboard.press("Escape");

  await enumFilterButton("control").click();
  await page.locator(".config-enum-filter")
    .getByRole("checkbox", { name: "All" })
    .check();
  await page.keyboard.press("Escape");
  await enumFilterButton("key").click();
  await page.locator(".config-enum-filter")
    .getByRole("checkbox", { name: "All" })
    .check();
  await page.keyboard.press("Escape");
  await expect(filteredRows).toHaveCount(23);

  const hardReturnColorRow = page.locator(
    '#table-config-grid .ag-row[row-id="sourceEditor.hardReturnColor"]',
  );
  await expect(hardReturnColorRow).toContainText("源码窗口");
  await expect(hardReturnColorRow).toContainText("通用");
  await expect(hardReturnColorRow).toContainText("hardReturnColor");
  await expect(hardReturnColorRow).toContainText('"#9aa79d"');
  await hardReturnColorRow.click();
  await expect(page.locator("#editor-mode-status")).toHaveText(
    "已定位 JSON · 源码窗口 / 通用 / hardReturnColor",
  );

  const colorConfig = JSON.parse(TABLE_PRESENTATION_DEFAULT_SOURCE) as {
    配置: Array<{
      控件: string;
      键值: Record<string, unknown>;
    }>;
  };
  const colorEntry = colorConfig.配置.find(
    (entry) =>
      entry.控件 === "源码窗口"
      && "hardReturnColor" in entry.键值,
  );
  expect(colorEntry).toBeTruthy();
  if (colorEntry) {
    colorEntry.键值.hardReturnColor = "#ff0000";
  }
  await replaceTableConfig(
    page,
    JSON.stringify(colorConfig, null, 2) + "\n",
  );
  await expect(page.locator("#editor-mode-status")).toContainText(
    "实时预览（未保存）",
  );
  await page.locator("#editor-tab-source").click();
  const firstHardReturn = page
    .locator("#working-editor .cm-hard-return-marker")
    .first();
  await expect(firstHardReturn).toBeVisible();
  await expect.poll(async () =>
    firstHardReturn.evaluate((node) => getComputedStyle(node).color)
  ).toBe("rgb(255, 0, 0)");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#can-save")).toHaveText("否");
  await page.locator("#editor-tab-table-config").click();
  await replaceTableConfig(page, TABLE_PRESENTATION_DEFAULT_SOURCE);
  await page.locator("#editor-tab-source").click();
  await expect.poll(async () =>
    page.locator("#working-editor .cm-hard-return-marker").first()
      .evaluate((node) => getComputedStyle(node).color)
  ).toBe("rgb(154, 167, 157)");
  await page.locator("#editor-tab-table-config").click();

  const hardReturnRow = page
    .locator("#table-config-grid .ag-row")
    .filter({ hasText: "showHardReturns" });
  await expect(hardReturnRow).toContainText("源码窗口");
  await expect(hardReturnRow).toContainText("通用");
  await expect(hardReturnRow).toContainText("showHardReturns");
  const hardReturnToggle = hardReturnRow.locator('input[type="checkbox"]');
  await expect(hardReturnToggle).toBeChecked();
  await hardReturnToggle.uncheck();
  await expect(hardReturnToggle).not.toBeChecked();
  await expect(hardReturnRow).toContainText("false");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");

  await page.locator("#editor-tab-source").click();
  await expect(page.locator("#working-editor .cm-hard-return-marker")).toHaveCount(0);
  await expect(page.locator("#table-config-grid")).toBeHidden();
  await expect(page.locator("#calibration-grid")).toBeVisible();
  await page.locator("#editor-tab-table-config").click();

  const annotationSortRow = page
    .locator("#table-config-grid .ag-row")
    .filter({ hasText: "注释数据表" })
    .filter({ hasText: "sort" });
  await expect(annotationSortRow).toContainText(
    '["注释号","行号"]',
  );
  await annotationSortRow.click();
  await expect(page.locator("#editor-mode-status")).toHaveText(
    "已定位 JSON · 注释数据表 / 通用 / sort",
  );

  const valid = JSON.stringify({
    版本: 2,
    配置: [
      {
        控件: "源码窗口",
        功能组: "通用",
        键值: { showHardReturns: false },
        中文描述: "显示硬回车",
      },
      {
        控件: "注释数据表",
        功能组: "通用",
        键值: {
          columns: ["注释号", "行号", "预览", "行类型", "配对状态"],
        },
        中文描述: "列顺序",
      },
      {
        控件: "注释数据表",
        功能组: "通用",
        键值: {
          sort: [
            { column: "注释号", direction: "desc" },
            "行号",
          ],
        },
        中文描述: "默认排序",
      },
      {
        控件: "注释数据表",
        功能组: "通用",
        键值: {
          columnStyles: {
            行号: { pinned: null },
            预览: { minWidth: 220, flex: 1 },
            配对状态: { hidden: true },
          },
        },
        中文描述: "列样式",
      },
    ],
  }, null, 2) + "\n";

  await replaceTableConfig(page, valid);
  await expect(page.locator("#editor-mode-status")).toContainText(
    "实时预览（未保存）",
  );
  await page.locator("#editor-tab-source").click();
  await expect(page.locator("#calibration-grid")).toBeVisible();
  await expect.poll(async () => (await headerOrder(page)).slice(0, 3))
    .toEqual(["annotationNumber", "sourceLine", "preview"]);
  await expect(page.locator("#calibration-grid .ag-row").first().locator(
    '[col-id="annotationNumber"]',
  )).toHaveText("10");
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
    '[col-id="annotationNumber"]',
  )).toHaveText("10");
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
    '[col-id="annotationNumber"]',
  )).toHaveText("10");
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
