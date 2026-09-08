import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test.describe.configure({ timeout: 60_000 });

test("annotation feature debug enforces source-derived read-only numbers and restores baseline", async ({ page, request }) => {
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

  const action = page.locator("#ui-debug-annotation");
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
    "注释模块功能调试",
  );
  await expect(page.locator("#feature-debug-progress-title")).toContainText(
    "5/5 通过",
    { timeout: 35_000 },
  );

  await expect(page.locator("#source-location-status")).toContainText(
    "安全恢复原 #1",
  );
  await expect(page.locator("#active-review-module")).toHaveText("注释");
  await expect(page.locator("#active-module-rows")).toHaveText("20");
  await expect(page.locator("#annotation-pairs")).toHaveText("10");
  await expect(
    page.locator('#calibration-grid .ag-row[row-index="0"] [col-id="annotationNumber"]'),
  ).toHaveText("1");
  await expect(
    page.locator("#calibration-grid input.annotation-number-input"),
  ).toHaveCount(0);
  await expect(
    page.locator('#calibration-grid .ag-row[row-index="0"] select.calibration-line-type'),
  ).toHaveValue("注释引用");
  await expect(page.locator("#annotation-match-status")).toContainText(
    "配对 10 · 缺引用 0 · 缺正文 0 · 缺号 0",
  );
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
