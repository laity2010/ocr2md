import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("initialize working draft creates a clean reusable feature-debug baseline", async ({ page, request }) => {
  ensureFeatureDebugCopy();
  const catalog = await request.get("/__workspace/chapters").then((response) =>
    response.json() as Promise<{
      chapters: Array<{ id: string; name: string; ready: boolean }>;
    }>,
  );
  const target = catalog.chapters.find(
    (chapter) => chapter.ready && chapter.name.includes("副本"),
  );
  expect(target).toBeTruthy();

  const baseline = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "false",
  );

  const undoRedoDebug = page.locator("#ui-debug-undo-redo");
  await page.locator("#ui-debug-toggle").click();
  await expect(page.locator("#ui-debug-initialize")).toBeEnabled();
  await expect(undoRedoDebug).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.locator("#workspace-splitter").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#workspace-splitter")).toHaveAttribute(
    "aria-valuenow",
    "45",
  );
  await page.locator("#editor-preview-splitter").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#editor-preview-splitter")).toHaveAttribute(
    "aria-valuenow",
    "57",
  );
  await page.locator("#regex-search-toggle").click();
  await page.locator("#regex-search").fill("temporary");
  await page.locator("#search-case").check();

  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#chapter-path")).toContainText("副本");
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#heading-numbering")).toBeChecked();
  await expect(page.locator("#workspace-splitter")).toHaveAttribute(
    "aria-valuenow",
    "43",
  );
  await expect(page.locator("#editor-preview-splitter")).toHaveAttribute(
    "aria-valuenow",
    "55",
  );
  await expect(page.locator("#regex-search")).toHaveValue("");
  await expect(page.locator("#search-case")).not.toBeChecked();
  await expect(page.locator("#source-location-status")).toContainText(
    "功能调试已初始化",
  );

  const layout = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>("#calibration-grid");
    const firstRow = document.querySelector<HTMLElement>(
      "#calibration-grid .ag-row",
    );
    const status = document.querySelector<HTMLElement>(
      ".grid-pane > .pane-status",
    );
    if (!grid || !firstRow || !status) return null;
    const gridRect = grid.getBoundingClientRect();
    const rowRect = firstRow.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    return {
      grid: {
        top: gridRect.top,
        bottom: gridRect.bottom,
        width: gridRect.width,
        height: gridRect.height,
      },
      row: {
        top: rowRect.top,
        bottom: rowRect.bottom,
        height: rowRect.height,
      },
      status: {
        top: statusRect.top,
        bottom: statusRect.bottom,
        height: statusRect.height,
      },
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.grid.width).toBeGreaterThan(300);
  expect(layout!.grid.height).toBeGreaterThan(300);
  expect(layout!.row.height).toBeGreaterThan(30);
  expect(layout!.row.top).toBeGreaterThanOrEqual(layout!.grid.top);
  expect(layout!.row.bottom).toBeLessThanOrEqual(layout!.grid.bottom);
  expect(layout!.status.top).toBeGreaterThanOrEqual(layout!.grid.bottom - 1);

  await page.locator("#ui-debug-toggle").click();
  await expect(undoRedoDebug).toBeEnabled();

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{ workingText: string; revision: string }>,
    );
  expect(current.workingText).toBe(baseline.workingText);
  expect(current.revision).toBe(baseline.revision);
});

test("initialize working draft refuses to discard a dirty chapter", async ({ page }) => {
  ensureFeatureDebugCopy();
  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  const baselineLength = Number(
    await page.locator("#working-length").textContent(),
  );

  const editor = page.locator("#working-editor .cm-content");
  await editor.click();
  await page.keyboard.type("X");
  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(
    String(baselineLength + 1),
  );

  await page.locator("#ui-debug-toggle").click();
  await page.locator("#ui-debug-initialize").click();

  await expect(page.locator("#state-value")).toHaveText("chapter-dirty");
  await expect(page.locator("#working-length")).toHaveText(
    String(baselineLength + 1),
  );
  await expect(page.locator("#source-location-status")).toContainText(
    "功能调试初始化失败",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "false",
  );

  await page.locator("#undo").click();
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
});
