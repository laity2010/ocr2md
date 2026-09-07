import { expect, test } from "@playwright/test";
import { ensureFeatureDebugCopy } from "./debugFixture";

test("review row locate feature debug uses real rows and never dirties the chapter", async ({ page, request }) => {
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
        sidecar: unknown;
        revision: string;
      }>,
    );

  await page.goto("/");
  await page.locator("#ui-debug-toggle").click();

  const action = page.locator("#ui-debug-review-row-locate");
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
    "数据表行定位源码功能调试",
  );
  await expect
    .poll(
      () => page.locator("#feature-debug-progress-title").textContent(),
      { timeout: 12_000 },
    )
    .toMatch(/3\/3 通过|失败/);

  const debugTitle = await page
    .locator("#feature-debug-progress-title")
    .textContent();
  if (debugTitle?.includes("失败")) {
    const detail = await page.locator("#feature-debug-progress-list").textContent();
    const status = await page.locator("#source-location-status").textContent();
    throw new Error(
      "行定位功能调试失败：" + detail + "；状态：" + status,
    );
  }

  await expect(page.locator("#source-location-status")).toContainText(
    "数据表行定位源码功能调试通过",
  );
  await expect(page.locator("#editor-tab-source")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#working-editor")).toBeVisible();
  await expect(page.locator("#active-review-module")).toHaveText("章节标题");
  await expect(page.locator("#state-value")).toHaveText("chapter-clean");
  await expect(page.locator("#undo-depth")).toHaveText("0");
  await expect(page.locator("#redo-depth")).toHaveText("0");
  await expect(page.locator("#save")).toBeDisabled();

  const current = await request
    .get("/__workspace/chapter?chapterId=" + encodeURIComponent(target!.id))
    .then((response) =>
      response.json() as Promise<{
        workingText: string;
        sidecar: unknown;
        revision: string;
      }>,
    );

  expect(current.workingText).toBe(baseline.workingText);
  expect(current.sidecar).toEqual(baseline.sidecar);
  expect(current.revision).toBe(baseline.revision);

  await expect(action).toBeDisabled();
});
