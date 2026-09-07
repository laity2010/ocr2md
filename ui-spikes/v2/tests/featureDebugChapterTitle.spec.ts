import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test.describe.configure({ timeout: 60_000 });

test("chapter title feature debug covers ignore level edit numbering save reentry and restores baseline", async ({ page, request }) => {
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
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-chapter-title");
  await expect(action).toBeDisabled();

  await page.locator("#ui-debug-initialize").click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-feature-debug-ready",
    "true",
  );

  await page.locator("#ui-debug-toggle").click();
  await expect(action).toBeEnabled();
  await action.click();

  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "章节标题模块功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 25_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "安全恢复原 H2",
  );
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#active-module-rows")).toHaveText("10");
  await expect(page.locator("#heading-numbering")).toBeChecked();
  await expect(page.locator("#title-export-status")).toHaveText(
    "导出效果：10 个标题 · 导出标题 10 个 · 已编号 10 个",
  );
  await expect(
    page.locator("#calibration-grid .ag-row").nth(1)
      .locator("select.calibration-line-type"),
  ).toHaveValue("2 级标题");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        sidecar: Record<string, unknown>;
        revision: string;
      }>,
    );

  expect(current.workingText).toBe(baseline.workingText);
  expect(current.sidecar).toEqual(baseline.sidecar);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
